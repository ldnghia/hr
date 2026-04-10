import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginate, buildPaginatedResponse } from '../common/dto/pagination.dto';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { ShiftService, hhmmToMinutes } from './shift.service';
import { LocationService, haversineMetres } from './location.service';
import { CalendarService } from '../calendar/calendar.service';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { formatDate, formatDateTime } from '../common/utils/format';

const ATTENDANCE_EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  email: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  office: { select: { id: true, name: true } },
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftService: ShiftService,
    private readonly locationService: LocationService,
    private readonly calendarService: CalendarService,
  ) {}

  // ─── Manual check-in / check-out ─────────────────────────────────────────

  async checkInOut(employeeId: number, type: 'check_in' | 'check_out', timestamp?: string) {
    const ts = timestamp ? new Date(timestamp) : new Date();
    const dateOnly = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));

    let attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, date: dateOnly },
    });

    if (type === 'check_in') {
      if (attendance?.checkinTime) {
        throw new BadRequestException('Already checked in today');
      }
      if (!attendance) {
        attendance = await this.prisma.attendance.create({
          data: { employeeId, date: dateOnly, checkinTime: ts },
        });
      } else {
        attendance = await this.prisma.attendance.update({
          where: { id: attendance.id },
          data: { checkinTime: ts },
        });
      }
    } else {
      if (!attendance?.checkinTime) {
        throw new BadRequestException('Must check in before checking out');
      }
      if (attendance.checkoutTime) {
        throw new BadRequestException('Already checked out today');
      }

      const diffMs = ts.getTime() - attendance.checkinTime.getTime();
      const workingHours = parseFloat((diffMs / 1000 / 60 / 60).toFixed(2));

      attendance = await this.prisma.attendance.update({
        where: { id: attendance.id },
        data: { checkoutTime: ts, workingHours },
      });
    }

    return attendance;
  }

  // ─── Raw import ───────────────────────────────────────────────────────────

  /**
   * Bulk-save raw timestamps from an access device.
   * Validates employee codes, inserts into AttendanceRaw, and returns the
   * distinct dates so the caller can immediately trigger processing.
   */
  async importRaw(dto: ImportAttendanceDto): Promise<{
    imported: number;
    unknownCodes: string[];
    dates: Date[];
  }> {
    const codes = [...new Set(dto.records.map((r) => r.employeeCode))];

    const employees = await this.prisma.employee.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });

    const knownCodes = new Set(employees.map((e) => e.code as string));
    const unknownCodes = codes.filter((c) => !knownCodes.has(c));

    const validRecords = dto.records.filter((r) => knownCodes.has(r.employeeCode));

    if (validRecords.length === 0) {
      throw new BadRequestException(
        `No valid records to import. Unknown employee codes: ${unknownCodes.join(', ')}`,
      );
    }

    await this.prisma.attendanceRaw.createMany({
      data: validRecords.map((r) => ({
        employeeCode: r.employeeCode,
        timestamp: new Date(r.timestamp),
      })),
    });

    const dateSet = new Set(
      validRecords.map((r) => {
        const ts = new Date(r.timestamp);
        return Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate());
      }),
    );
    const dates = [...dateSet].map((t) => new Date(t));

    return { imported: validRecords.length, unknownCodes, dates };
  }

  // ─── Report ───────────────────────────────────────────────────────────────

  async getReport(dto: ReportAttendanceDto, user: { id: number; role: string }) {
    const {
      page = 1,
      limit = 20,
      employeeId,
      departmentId,
      dateFrom,
      dateTo,
      q,
      employeeName,
      employeeCode,
      isLate,
      isEarlyOut,
      isOvertime,
    } = dto;
    const { skip, take } = paginate(page, limit);

    const where: any = { AND: [] };

    // 1. RBAC Scoping
    if (user.role === 'manager') {
      where.AND.push({
        OR: [{ employeeId: user.id }, { employee: { managerId: user.id } }],
      });
    } else if (user.role === 'employee') {
      where.AND.push({ employeeId: user.id });
    }

    // 2. Specific filters
    if (employeeId) where.AND.push({ employeeId });
    if (departmentId) where.AND.push({ employee: { departmentId } });

    if (dateFrom || dateTo) {
      const dateFilter: any = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.AND.push({ date: dateFilter });
    }

    // 3. Search / Column filters
    if (q) {
      where.AND.push({
        OR: [
          { employee: { fullName: { contains: q, mode: 'insensitive' } } },
          { employee: { code: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (employeeName) {
      where.AND.push({ employee: { fullName: { contains: employeeName, mode: 'insensitive' } } });
    }
    if (employeeCode) {
      where.AND.push({ employee: { code: { contains: employeeCode, mode: 'insensitive' } } });
    }

    if (isLate !== undefined) where.AND.push({ isLate });
    if (isEarlyOut !== undefined) where.AND.push({ isEarlyOut });
    if (isOvertime !== undefined) where.AND.push({ isOvertime });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: { 
          employee: { select: ATTENDANCE_EMPLOYEE_SELECT },
          shift: true
        },
        skip,
        take,
        orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
      }),
      this.prisma.attendance.count({ where }),
    ]);

    const totalWorkingHours = data.reduce(
      (sum, r) => sum + (r.workingHours ? Number(r.workingHours) : 0),
      0,
    );

    return {
      ...buildPaginatedResponse(data, total, page, limit),
      summary: {
        totalRecords: total,
        totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
      },
    };
  }

  async exportReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    // 1. Get ALL data (no pagination)
    const { data } = await this.getReport({ ...dto, page: 1, limit: 10000 }, user);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    worksheet.columns = [
      { header: 'Employee Code', key: 'code', width: 15 },
      { header: 'Full Name', key: 'name', width: 25 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Check-in', key: 'checkin', width: 20 },
      { header: 'Check-out', key: 'checkout', width: 20 },
      { header: 'Working Hours', key: 'hours', width: 15 },
      { header: 'Status', key: 'status', width: 25 },
      { header: 'In Note', key: 'inNote', width: 25 },
      { header: 'Out Note', key: 'outNote', width: 25 },
    ];

    data.forEach((r: any) => {
      const statusArr: string[] = [];
      if (r.isLate) statusArr.push('Late');
      if (r.isEarlyOut) statusArr.push('Early Out');
      if (r.isOvertime) statusArr.push('Overtime');
      if (statusArr.length === 0 && r.checkinTime) statusArr.push('Normal');

      worksheet.addRow({
        code: r.employee?.code,
        name: r.employee?.fullName,
        date: formatDate(r.date),
        checkin: r.checkinTime ? formatDateTime(r.checkinTime) : '-',
        checkout: r.checkoutTime ? formatDateTime(r.checkoutTime) : '-',
        hours: r.workingHours ? Number(r.workingHours).toFixed(2) : '0.00',
        status: statusArr.join(', '),
        inNote: r.checkinNote || '-',
        outNote: r.checkoutNote || '-',
      });
    });

    // Formatting
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + `Attendance_Report_${formatDate(new Date())}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async findAll(query: PaginationDto & { employeeId?: number; date?: string }) {
    const { page = 1, limit = 20, employeeId, date } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (date) where.date = new Date(date);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: { employee: { select: ATTENDANCE_EMPLOYEE_SELECT } },
        skip,
        take,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findTodayStatus(employeeId: number) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayStr = today.toISOString().split('T')[0];

    const [attendance, dayInfo] = await Promise.all([
      this.prisma.attendance.findFirst({
        where: { employeeId, date: today },
        include: { shift: true },
      }),
      this.calendarService.checkDay(todayStr),
    ]);

    return {
      date: today,
      attendance: attendance ?? null,
      checkedIn: !!attendance?.checkinTime,
      checkedOut: !!attendance?.checkoutTime,
      dayInfo,
    };
  }

  async getSummary(employeeId: number, month: number, year: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));

    const records = await this.prisma.attendance.findMany({
      where: { employeeId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    const totalWorkingHours = records.reduce(
      (acc, r) => acc + (r.workingHours ? Number(r.workingHours) : 0),
      0,
    );

    return {
      employeeId,
      month,
      year,
      totalDays: records.length,
      totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
      records,
    };
  }

  // ─── WFM: Check-in ────────────────────────────────────────────────────────

  async checkIn(employeeId: number, dto: CheckInDto) {
    const ts = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const dateOnly = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));
    const dateStr = dateOnly.toISOString().split('T')[0];

    // 1. Core context
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        shiftId: true,
        workingMode: true,
        office: { select: { latitude: true, longitude: true, radius: true, name: true } },
      },
    });

    // 2. Prevent double check-in
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: dateOnly } },
    });
    if (existing?.checkinTime) {
      throw new BadRequestException('Already checked in today');
    }

    // 3. Office GPS validation
    const hasGps = dto.lat != null && dto.lng != null;
    let officeDistanceM: number | undefined;
    let isInOffice = false;
    let officeStatus: 'IN_OFFICE' | 'OUTSIDE' | null = null;

    if (hasGps && emp?.office) {
      const { latitude, longitude, radius } = emp.office;
      const dist = haversineMetres(dto.lat!, dto.lng!, latitude, longitude);
      officeDistanceM = Math.round(dist);
      isInOffice = dist <= radius;
      officeStatus = isInOffice ? 'IN_OFFICE' : 'OUTSIDE';
    }

    // 4. Geofence validation (WorkLocation table)
    let isWithinGeofence = false;
    let nearestLoc: { name: string; distanceM: number; id: number } | undefined;

    if (hasGps) {
      const nearest = await this.locationService.findNearest(dto.lat!, dto.lng!);
      if (nearest) {
        isWithinGeofence = nearest.withinRadius;
        nearestLoc = { name: nearest.name, distanceM: nearest.distanceM, id: nearest.locationId };
      }
    }

    // 4b. Branch geofence validation — must run BEFORE the location guard so
    //     users inside a branch radius are not incorrectly forced to provide a reason.
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

    // 5. Location guard: MUST be in assigned office OR any WorkLocation OR any Branch OR provide a reason
    const locationNote = dto.locationNote?.trim();
    if (!isInOffice && !isWithinGeofence && !isWithinBranch && !locationNote) {
      if (!hasGps) {
        throw new BadRequestException('GPS location is required or provide a reason (Working from client, etc.)');
      }
      const officeName = emp?.office?.name || 'an authorized office';
      throw new BadRequestException(`You are outside "${officeName}". Please provide a reason to clock in.`);
    }

    let resolvedLocationId = nearestLoc?.id;
    let distanceM = nearestLoc?.distanceM;

    const dayInfo = await this.calendarService.checkDay(dateStr);

    // 6. Resolve shift
    let shift: Awaited<ReturnType<ShiftService['detectShift']>> = null;
    if (emp?.shiftId) {
      shift = await this.prisma.shift.findUnique({ where: { id: emp.shiftId } }) ?? null;
    } else if (!emp?.workingMode || emp.workingMode === 'FIXED') {
      shift = await this.shiftService.findDefault();
    } else {
      shift = await this.shiftService.detectShift(ts);
    }
    const shiftId = shift?.id ?? undefined;

    // 7. Determine late
    let isLate = false;
    if (shift) {
      const checkinMin = ts.getHours() * 60 + ts.getMinutes();
      const startMin   = hhmmToMinutes(shift.startTime);
      const normalMin  = shift.isCrossDay && checkinMin < startMin ? checkinMin + 1440 : checkinMin;
      isLate = normalMin > startMin + shift.graceLateMinutes;
    }

    // 8. Upsert attendance row
    const attendance = existing
      ? await this.prisma.attendance.update({
          where: { id: existing.id },
          data: {
            checkinTime: ts,
            shiftId,
            isLate,
            checkinLat: dto.lat,
            checkinLng: dto.lng,
            officeDistanceM,
            isInOffice,
            hasLocation: hasGps,
            checkinNote: locationNote,
            locationNote, // for backward compatibility
          },
        })
      : await this.prisma.attendance.create({
          data: {
            employeeId,
            date: dateOnly,
            checkinTime: ts,
            shiftId,
            isLate,
            checkinLat: dto.lat,
            checkinLng: dto.lng,
            officeDistanceM,
            isInOffice,
            hasLocation: hasGps,
            checkinNote: locationNote,
            locationNote, // for backward compatibility
          },
        });

    // 9. Write audit log entry
    await this.prisma.attendanceLog.create({
      data: {
        employeeId,
        time: ts,
        type: 'check_in',
        lat: dto.lat,
        lng: dto.lng,
        locationId: resolvedLocationId,
        deviceId: dto.deviceId,
        distanceM,
        note: locationNote,
        attendanceId: attendance.id,
      },
    });

    // 10. nearestBranch is already computed in step 4b (moved up for location guard).

    return {
      attendance,
      isLate,
      dayInfo,
      shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
      location: resolvedLocationId ? { id: resolvedLocationId, distanceM } : null,
      office: officeStatus !== null ? { status: officeStatus, distanceM: officeDistanceM } : null,
      locationSource: hasGps ? 'GPS' : 'NO_LOCATION',
      nearestBranch,
    };
  }

  // ─── WFM: Check-out ───────────────────────────────────────────────────────

  async checkOut(employeeId: number, dto: CheckOutDto) {
    const ts = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const dateOnly = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));

    const attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, date: dateOnly },
      include: { shift: true },
    });

    if (!attendance?.checkinTime) {
      throw new BadRequestException('Must check in before checking out');
    }
    if (attendance.checkoutTime) {
      throw new BadRequestException('Already checked out today');
    }

    // 1. Office GPS validation
    const hasGps = dto.lat != null && dto.lng != null;
    let isInOffice = false;
    let officeName = 'office';

    if (hasGps) {
      const emp = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { office: { select: { latitude: true, longitude: true, radius: true, name: true } } },
      });
      if (emp?.office) {
        officeName = emp.office.name;
        const dist = haversineMetres(dto.lat!, dto.lng!, emp.office.latitude, emp.office.longitude);
        isInOffice = dist <= emp.office.radius;
      }
    }

    // 2. Geofence validation (WorkLocation table)
    let isWithinGeofence = false;
    let nearestLoc: { name: string; distanceM: number; id: number } | undefined;

    if (hasGps) {
      const nearest = await this.locationService.findNearest(dto.lat!, dto.lng!);
      if (nearest) {
        isWithinGeofence = nearest.withinRadius;
        nearestLoc = { name: nearest.name, distanceM: nearest.distanceM, id: nearest.locationId };
      }
    }

    // 2b. Branch geofence validation — must run BEFORE the location guard.
    let isWithinBranch = false;
    if (hasGps) {
      const branches = await this.prisma.branch.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { id: true, latitude: true, longitude: true, radius: true },
      });
      for (const branch of branches) {
        if (branch.latitude == null || branch.longitude == null) continue;
        const dist = haversineMetres(dto.lat!, dto.lng!, branch.latitude, branch.longitude);
        if (dist <= (branch.radius ?? 50)) {
          isWithinBranch = true;
          break;
        }
      }
    }

    // 3. Location guard: assigned office OR WorkLocation OR Branch OR reason
    const locationNote = dto.locationNote?.trim();
    if (!isInOffice && !isWithinGeofence && !isWithinBranch && !locationNote) {
      throw new BadRequestException(`You are outside "${officeName}". Please provide a reason to clock out.`);
    }

    let resolvedLocationId = nearestLoc?.id;
    let distanceM = nearestLoc?.distanceM;

    // Calculate working hours
    const diffMs = ts.getTime() - attendance.checkinTime.getTime();
    const workingHours = parseFloat((diffMs / 1000 / 3600).toFixed(2));

    // WFM status flags (cross-day aware)
    let isEarlyOut = false;
    let isOvertime = false;
    let overtimeHours: number | undefined;

    if (attendance.shift) {
      const s = attendance.shift;
      const startMin = hhmmToMinutes(s.startTime);
      let endMin = hhmmToMinutes(s.endTime);
      // Normalize end time for cross-day shifts
      if (s.isCrossDay && endMin <= startMin) endMin += 1440;

      const normalHours = (endMin - startMin - s.breakMinutes) / 60;
      const graceEarlyH  = s.graceEarlyMinutes / 60;

      isEarlyOut = workingHours < normalHours - graceEarlyH;
      isOvertime = workingHours > normalHours;
      if (isOvertime) {
        overtimeHours = parseFloat((workingHours - normalHours).toFixed(2));
      }
    }

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkoutTime: ts,
        workingHours,
        isEarlyOut,
        isOvertime,
        overtimeHours,
        checkoutLat: dto.lat,
        checkoutLng: dto.lng,
        checkoutNote: locationNote,
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
        distanceM,
        note: locationNote,
        attendanceId: attendance.id,
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

  // ─── WFM: My records ──────────────────────────────────────────────────────

  async getMyRecords(
    employeeId: number,
    query: PaginationDto & { dateFrom?: string; dateTo?: string },
  ) {
    const { page = 1, limit = 20, dateFrom, dateTo } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = { employeeId };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: { shift: true },
        skip,
        take,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }
}
