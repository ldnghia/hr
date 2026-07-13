import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftResolverService } from './helpers/shift-resolver';
import { computeSessionDate, computeSessionFlags } from './helpers/session-hours';
import { LocationService, haversineMetres } from './location.service';
import { CalendarService } from '../calendar/calendar.service';
import { DeviceValidationService } from '../device/device-validation.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

@Injectable()
export class AttendanceCheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
    private readonly locationService: LocationService,
    private readonly calendarService: CalendarService,
    private readonly deviceValidation: DeviceValidationService,
  ) {}

  // ─── Check-in ─────────────────────────────────────────────────────────────

  async checkIn(employeeId: number, dto: CheckInDto, ipAddress?: string) {
    const ts = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const sessionDate = computeSessionDate(ts);
    const dateStr = sessionDate.toISOString().split('T')[0];

    // 1. Employee context
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        shiftId: true,
        workingMode: true,
        office: { select: { latitude: true, longitude: true, radius: true, name: true } },
        department: { select: { branch: { select: { latitude: true, longitude: true, radius: true, name: true } } } },
      },
    });
    // Fall back to the employee's department branch when no personal office is assigned
    // (most employees are geofenced via their department's branch, not a personal office).
    const officeSource = emp?.office ?? (
      emp?.department?.branch?.latitude != null && emp?.department?.branch?.longitude != null
        ? emp.department.branch
        : null
    );

    // 2. Resolve shift (multi-shift aware)
    const shift = await this.shiftResolver.resolveTargetShift(employeeId, ts, dto.shiftId);
    const shiftId = shift.id;

    // 3. Guard: already checked in for THIS shift session (exclude soft-deleted)
    const existing = await this.prisma.attendance.findFirst({
      where: { employeeId, date: sessionDate, shiftId, deletedAt: null },
    });
    if (existing?.checkinTime) {
      throw new BadRequestException(`Đã chấm công vào ca "${shift.name}" hôm nay rồi`);
    }

    // 3b. SHIFT employees: only one active session allowed at a time
    // Check today AND yesterday (cross-day shift support)
    if (emp?.workingMode === 'SHIFT') {
      const yesterday = new Date(sessionDate.getTime() - 24 * 60 * 60 * 1000);
      const activeSession = await this.prisma.attendance.findFirst({
        where: {
          employeeId,
          checkinTime: { not: null },
          checkoutTime: null,
          date: { in: [sessionDate, yesterday] },
          deletedAt: null,
        },
        include: { shift: { select: { name: true } } },
      });
      if (activeSession) {
        throw new BadRequestException(
          `Bạn đang trong ca "${activeSession.shift?.name ?? 'khác'}". Vui lòng checkout trước khi chấm công ca mới.`,
        );
      }
    }

    // 4. GPS / office validation
    const hasGps = dto.lat != null && dto.lng != null;
    let officeDistanceM: number | undefined;
    let isInOffice = false;
    let officeStatus: 'IN_OFFICE' | 'OUTSIDE' | null = null;

    if (hasGps && officeSource) {
      const { latitude, longitude, radius } = officeSource;
      const dist = haversineMetres(dto.lat!, dto.lng!, latitude!, longitude!);
      officeDistanceM = Math.round(dist);
      isInOffice = dist <= radius;
      officeStatus = isInOffice ? 'IN_OFFICE' : 'OUTSIDE';
    }

    // 5. Geofence validation (WorkLocation table)
    let isWithinGeofence = false;
    let nearestLoc: { name: string; distanceM: number; id: number } | undefined;

    if (hasGps) {
      const nearest = await this.locationService.findNearest(dto.lat!, dto.lng!);
      if (nearest) {
        isWithinGeofence = nearest.withinRadius;
        nearestLoc = { name: nearest.name, distanceM: nearest.distanceM, id: nearest.locationId };
      }
    }

    // 6. Branch geofence validation
    let isWithinBranch = false;
    let nearestBranch: { id: number; name: string; distanceM: number; isInOffice: boolean } | null = null;

    if (hasGps) {
      const branches = await this.prisma.branch.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { id: true, name: true, latitude: true, longitude: true, radius: true },
      });
      for (const branch of branches) {
        if (branch.latitude == null || branch.longitude == null) continue;
        const dist = Math.round(haversineMetres(dto.lat!, dto.lng!, branch.latitude, branch.longitude));
        if (!nearestBranch || dist < nearestBranch.distanceM) {
          nearestBranch = {
            id: branch.id,
            name: branch.name ?? 'Unknown',
            distanceM: dist,
            isInOffice: dist <= (branch.radius ?? 50),
          };
        }
      }
      isWithinBranch = nearestBranch?.isInOffice ?? false;
    }

    // 7. Location guard
    const locationNote = dto.locationNote?.trim();
    if (!isInOffice && !isWithinGeofence && !isWithinBranch && !locationNote) {
      if (!hasGps) {
        throw new BadRequestException('GPS location is required or provide a reason (Working from client, etc.)');
      }
      const officeName = officeSource?.name || 'an authorized office';
      throw new BadRequestException(`You are outside "${officeName}". Please provide a reason to clock in.`);
    }

    // Upgrade office status if within branch/geofence
    if (!isInOffice && (isWithinBranch || isWithinGeofence)) {
      isInOffice = true;
      if (officeStatus === 'OUTSIDE') officeStatus = 'IN_OFFICE';
    }

    const resolvedLocationId = nearestLoc?.id;
    const distanceM = nearestLoc?.distanceM;
    const dayInfo = await this.calendarService.checkDay(dateStr);

    // 7b. Device validation
    const { unknown: isUnknownDevice } = await this.deviceValidation.validateForCheckIn(
      employeeId,
      dto.deviceId,
    );

    // 8. Compute late flag
    const { isLate } = computeSessionFlags(ts, null, shift);

    const unknownDeviceNote = isUnknownDevice ? '[THIẾT BỊ CHƯA ĐĂNG KÝ] ' : '';

    // 9. Create/restore attendance row (composite key: employeeId + date + shiftId)
    // Cannot use upsert because a soft-deleted record with the same key would be updated
    // without clearing deletedAt, causing the new check-in to remain invisible.
    const checkinData = {
      checkinTime: ts,
      isLate,
      checkinLat: dto.lat,
      checkinLng: dto.lng,
      officeDistanceM,
      isInOffice,
      hasLocation: hasGps,
      checkinNote: unknownDeviceNote + (locationNote ?? ''),
      locationNote,
      isUnknownDevice,
    };

    // Check if a soft-deleted record exists for this key — restore it instead of inserting
    const softDeleted = await this.prisma.attendance.findFirst({
      where: { employeeId, date: sessionDate, shiftId, deletedAt: { not: null } },
    });

    let attendance;
    if (softDeleted) {
      // Restore the soft-deleted record with fresh check-in data
      attendance = await this.prisma.attendance.update({
        where: { id: softDeleted.id },
        data: { ...checkinData, deletedAt: null, checkoutTime: null, workingHours: null },
      });
    } else {
      attendance = await this.prisma.attendance.create({
        data: { employeeId, date: sessionDate, shiftId, ...checkinData },
      });
    }

    // 10. Audit log
    await this.prisma.attendanceLog.create({
      data: {
        employeeId,
        time: ts,
        type: 'check_in',
        lat: dto.lat,
        lng: dto.lng,
        locationId: resolvedLocationId,
        deviceId: dto.deviceId,
        ipAddress,
        distanceM,
        isInOffice,
        officeDistanceM,
        note: locationNote,
        attendanceId: attendance.id,
      },
    });

    return {
      attendance,
      isLate,
      isUnknownDevice,
      dayInfo,
      shift: { id: shift.id, startTime: shift.startTime, endTime: shift.endTime },
      location: resolvedLocationId ? { id: resolvedLocationId, distanceM } : null,
      office: officeStatus !== null ? { status: officeStatus, distanceM: officeDistanceM } : null,
      locationSource: hasGps ? 'GPS' : 'NO_LOCATION',
      nearestBranch,
    };
  }

  // ─── Check-out ────────────────────────────────────────────────────────────

  async checkOut(employeeId: number, dto: CheckOutDto, ipAddress?: string) {
    const ts = dto.timestamp ? new Date(dto.timestamp) : new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let target: any;

    // Direct lookup by attendanceId — used when closing unclosed sessions from previous days
    if (dto.attendanceId) {
      const record = await this.prisma.attendance.findFirst({
        where: { id: dto.attendanceId, deletedAt: null },
        include: { shift: true },
      });
      if (!record) throw new BadRequestException(`Attendance record #${dto.attendanceId} not found`);
      if (record.employeeId !== employeeId) throw new BadRequestException('Forbidden');
      if (!record.checkinTime) throw new BadRequestException('Record has no check-in time');
      if (record.checkoutTime) throw new BadRequestException('Session already closed');
      target = record;
    } else {
      const sessionDate = computeSessionDate(ts);
      const yesterday = new Date(sessionDate.getTime() - 24 * 60 * 60 * 1000);

      // Find open session(s) — check today first, then yesterday (cross-day shifts)
      let openSessions = await this.prisma.attendance.findMany({
        where: { employeeId, date: sessionDate, checkinTime: { not: null }, checkoutTime: null, deletedAt: null },
        include: { shift: true },
      });

      if (openSessions.length === 0) {
        // Cross-day shift fallback: 23:00–07:00 check-in date = yesterday
        openSessions = await this.prisma.attendance.findMany({
          where: { employeeId, date: yesterday, checkinTime: { not: null }, checkoutTime: null, deletedAt: null },
          include: { shift: true },
        });
      }

      if (openSessions.length === 0) {
        throw new BadRequestException('No open check-in session found for today');
      }

      target = openSessions[0];
      if (dto.shiftId) {
        const found = openSessions.find((a: any) => a.shiftId === dto.shiftId);
        if (!found) throw new BadRequestException(`Không tìm thấy ca đang mở cho shiftId ${dto.shiftId}`);
        target = found;
      } else if (openSessions.length > 1) {
        throw new BadRequestException(
          'Multiple open sessions — please specify shiftId to check out',
        );
      }
    }

    // GPS / office validation
    const hasGps = dto.lat != null && dto.lng != null;
    let isInOffice = false;
    let officeName = 'office';
    let checkoutOfficeDistanceM: number | undefined;

    if (hasGps) {
      const emp = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          office: { select: { latitude: true, longitude: true, radius: true, name: true } },
          department: { select: { branch: { select: { latitude: true, longitude: true, radius: true, name: true } } } },
        },
      });
      // Fall back to the employee's department branch when no personal office is assigned
      const officeSource = emp?.office ?? (
        emp?.department?.branch?.latitude != null && emp?.department?.branch?.longitude != null
          ? emp.department.branch
          : null
      );
      if (officeSource) {
        officeName = officeSource.name ?? officeName;
        const dist = haversineMetres(dto.lat!, dto.lng!, officeSource.latitude!, officeSource.longitude!);
        checkoutOfficeDistanceM = Math.round(dist);
        isInOffice = dist <= officeSource.radius;
      }
    }

    let isWithinGeofence = false;
    let nearestLoc: { name: string; distanceM: number; id: number } | undefined;

    if (hasGps) {
      const nearest = await this.locationService.findNearest(dto.lat!, dto.lng!);
      if (nearest) {
        isWithinGeofence = nearest.withinRadius;
        nearestLoc = { name: nearest.name, distanceM: nearest.distanceM, id: nearest.locationId };
      }
    }

    let isWithinBranch = false;
    if (hasGps) {
      const branches = await this.prisma.branch.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { id: true, latitude: true, longitude: true, radius: true },
      });
      for (const branch of branches) {
        if (branch.latitude == null || branch.longitude == null) continue;
        const dist = haversineMetres(dto.lat!, dto.lng!, branch.latitude, branch.longitude);
        if (dist <= (branch.radius ?? 50)) { isWithinBranch = true; break; }
      }
    }

    const locationNote = dto.locationNote?.trim();
    if (!isInOffice && !isWithinGeofence && !isWithinBranch && !locationNote) {
      throw new BadRequestException(`You are outside "${officeName}". Please provide a reason to clock out.`);
    }

    // Upgrade office status if within branch/geofence (same rule as check-in)
    if (!isInOffice && (isWithinBranch || isWithinGeofence)) {
      isInOffice = true;
    }

    // Device validation (warn-only for checkout — user may have switched device)
    const { unknown: isUnknownDeviceOut } = await this.deviceValidation.validateForCheckOut(
      employeeId,
      dto.deviceId,
    );

    const resolvedLocationId = nearestLoc?.id;
    const distanceM = nearestLoc?.distanceM;

    // Compute session flags using resolved shift
    const shift = target.shift;
    const { workingHours, isEarlyOut, isOvertime, overtimeHours } = computeSessionFlags(
      target.checkinTime!,
      ts,
      shift as any, // shift is included via relation
    );

    const checkoutUnknownNote = isUnknownDeviceOut ? '[THIẾT BỊ CHƯA ĐĂNG KÝ] ' : '';
    const updated = await this.prisma.attendance.update({
      where: { id: target.id },
      data: {
        checkoutTime: ts,
        workingHours,
        isEarlyOut,
        isOvertime,
        overtimeHours,
        checkoutLat: dto.lat,
        checkoutLng: dto.lng,
        checkoutNote: checkoutUnknownNote + (locationNote ?? ''),
        checkoutOfficeDistanceM,
        checkoutIsInOffice: isInOffice,
      },
    });

    await this.prisma.attendanceLog.create({
      data: {
        employeeId,
        time: ts,
        type: 'check_out',
        lat: dto.lat,
        lng: dto.lng,
        locationId: resolvedLocationId,
        deviceId: dto.deviceId,
        ipAddress,
        distanceM,
        isInOffice,
        officeDistanceM: checkoutOfficeDistanceM,
        note: locationNote,
        attendanceId: target.id,
      },
    });

    return {
      attendance: updated,
      workingHours,
      isEarlyOut,
      isOvertime,
      overtimeHours: overtimeHours ?? 0,
    };
  }

  // ─── Mark forgot checkout (no checkoutTime recorded) ─────────────────────

  async markForgotCheckout(employeeId: number, attendanceId: number) {
    const record = await this.prisma.attendance.findFirst({ where: { id: attendanceId, deletedAt: null } });
    if (!record) throw new BadRequestException(`Attendance record #${attendanceId} not found`);
    if (record.employeeId !== employeeId) throw new BadRequestException('Forbidden');
    if (!record.checkinTime) throw new BadRequestException('Record has no check-in time');
    if (record.checkoutTime) throw new BadRequestException('Session already closed');
    if (record.forgotCheckout) throw new BadRequestException('Already marked as forgot checkout');

    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        forgotCheckout: true,
        checkoutNote: 'Quên checkout',
      },
    });

    return { attendance: updated };
  }
}
