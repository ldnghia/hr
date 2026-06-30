import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceCorrectionLimitService } from './attendance-correction-limit.service';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import { AdminEditAttendanceDto } from './dto/admin-edit-attendance.dto';
import { ListCorrectionQueryDto } from './dto/list-correction-query.dto';
import { ApproveCorrectionDto, RejectCorrectionDto } from './dto/review-correction.dto';
import { CORRECTION_STATUS } from './attendance-correction.constants';
import { computeSessionFlags } from '../attendance/helpers/session-hours';
import type { ShiftLike } from '../attendance/helpers/shift-resolver';

const SHIFT_SELECT = {
  id: true, name: true, startTime: true, endTime: true,
  isCrossDay: true, graceLateMinutes: true, graceEarlyMinutes: true, breakMinutes: true,
} as const;

/** Recalculate all derived attendance flags from corrected check-in/out + shift. */
function recomputeFlags(
  checkin: Date | null,
  checkout: Date | null,
  shift: ShiftLike | null,
): {
  workingHours: number;
  isLate: boolean;
  isEarlyOut: boolean;
  isOvertime: boolean;
  overtimeHours: number;
} {
  if (!checkin || !shift) {
    return { workingHours: 0, isLate: false, isEarlyOut: false, isOvertime: false, overtimeHours: 0 };
  }
  const flags = computeSessionFlags(checkin, checkout, shift);
  return {
    workingHours: flags.workingHours,
    isLate: flags.isLate,
    isEarlyOut: flags.isEarlyOut,
    isOvertime: flags.isOvertime,
    overtimeHours: flags.overtimeHours,
  };
}

@Injectable()
export class AttendanceCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limitService: AttendanceCorrectionLimitService,
  ) {}

  // ── Create request ─────────────────────────────────────────────────────────

  async create(dto: CreateCorrectionDto, employeeId: number) {
    return this.prisma.$transaction(async (tx) => {
      let attendance: any;

      if (dto.attendanceId) {
        // Normal path: correct an existing record
        attendance = await tx.attendance.findFirst({ where: { id: dto.attendanceId, deletedAt: null } });
        if (!attendance) throw new NotFoundException('Attendance record not found');
        if (attendance.employeeId !== employeeId)
          throw new ForbiddenException('Not your attendance record');
      } else if (dto.date) {
        // No record path: find or create an empty attendance record for this date
        const dateObj = new Date(dto.date);
        dateObj.setUTCHours(0, 0, 0, 0);
        // If shiftId provided, filter to that specific shift record (CC employees with multiple shifts per day)
        const shiftFilter = dto.shiftId !== undefined ? { shiftId: dto.shiftId } : {};
        attendance = await tx.attendance.findFirst({
          where: { employeeId, date: dateObj, deletedAt: null, ...shiftFilter },
        });
        if (!attendance) {
          // Create empty record so the correction has something to reference
          attendance = await tx.attendance.create({
            data: {
              employeeId,
              date: dateObj,
              shiftId: dto.shiftId ?? null,
              isLate: false,
              isEarlyOut: false,
              isOvertime: false,
            },
          });
        }
      } else {
        throw new BadRequestException('Provide either attendanceId or date');
      }

      const activeCorrection = await tx.attendanceCorrectionRequest.findFirst({
        where: {
          attendanceId: attendance.id,
          status: CORRECTION_STATUS.PENDING,
        },
      });
      if (activeCorrection)
        throw new BadRequestException('A pending correction already exists for this record. Please wait for it to be reviewed or cancel it first.');

      await this.limitService.assertWithinLimit(employeeId, tx as unknown as PrismaService);

      const request = await tx.attendanceCorrectionRequest.create({
        data: {
          employeeId,
          attendanceId: attendance.id,
          requestedCheckinTime: dto.requestedCheckinTime
            ? new Date(dto.requestedCheckinTime)
            : null,
          requestedCheckoutTime: dto.requestedCheckoutTime
            ? new Date(dto.requestedCheckoutTime)
            : null,
          requestedCheckinNote: dto.requestedCheckinNote ?? null,
          requestedCheckoutNote: dto.requestedCheckoutNote ?? null,
          requestedShiftId: dto.requestedShiftId ?? null,
          originalCheckinTime: attendance.checkinTime,
          originalCheckoutTime: attendance.checkoutTime,
          originalCheckinNote: attendance.checkinNote,
          originalCheckoutNote: attendance.checkoutNote,
          originalShiftId: attendance.shiftId,
          reason: dto.reason,
          status: CORRECTION_STATUS.PENDING,
        },
      });

      return { data: request, message: 'Correction request submitted', statusCode: 201 };
    });
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  async approve(id: number, reviewerId: number, dto: ApproveCorrectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const req = await this.findPendingOrThrow(tx, id);

      const attendance = await tx.attendance.findFirst({ where: { id: req.attendanceId, deletedAt: null } });
      if (!attendance) throw new NotFoundException('Attendance record not found or has been deleted');

      const newCheckin  = req.requestedCheckinTime  ?? attendance.checkinTime;
      const newCheckout = req.requestedCheckoutTime ?? attendance.checkoutTime;
      const newShiftId  = req.requestedShiftId      ?? attendance.shiftId;

      // Fetch shift to recalculate isLate, isEarlyOut, workingHours correctly
      const shift = newShiftId
        ? await tx.shift.findUnique({ where: { id: newShiftId }, select: SHIFT_SELECT })
        : null;
      const flags = recomputeFlags(newCheckin, newCheckout, shift);

      await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          checkinTime:  newCheckin,
          checkoutTime: newCheckout,
          checkinNote:  req.requestedCheckinNote  ?? attendance.checkinNote,
          checkoutNote: req.requestedCheckoutNote ?? attendance.checkoutNote,
          shiftId: newShiftId,
          ...flags,
          isCorrected: true,
          correctionRequestId: req.id,
        },
      });

      const updated = await tx.attendanceCorrectionRequest.update({
        where: { id },
        data: {
          status: CORRECTION_STATUS.APPROVED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote ?? null,
        },
      });

      return { data: updated, message: 'Correction request approved', statusCode: 200 };
    });
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  async reject(id: number, reviewerId: number, dto: RejectCorrectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const req = await this.findPendingOrThrow(tx, id);

      const updated = await tx.attendanceCorrectionRequest.update({
        where: { id: req.id },
        data: {
          status: CORRECTION_STATUS.REJECTED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote,
        },
      });

      return { data: updated, message: 'Correction request rejected', statusCode: 200 };
    });
  }

  // ── Cancel (owner) ─────────────────────────────────────────────────────────

  async cancel(id: number, employeeId: number) {
    const req = await this.prisma.attendanceCorrectionRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Correction request not found');
    if (req.employeeId !== employeeId) throw new ForbiddenException('Not your request');
    if (req.status !== CORRECTION_STATUS.PENDING)
      throw new BadRequestException('Only pending requests can be cancelled');

    const updated = await this.prisma.attendanceCorrectionRequest.update({
      where: { id },
      data: { status: CORRECTION_STATUS.CANCELLED },
    });

    return { data: updated, message: 'Correction request cancelled', statusCode: 200 };
  }

  // ── Admin direct edit ──────────────────────────────────────────────────────

  async adminEdit(attendanceId: number, adminId: number, dto: AdminEditAttendanceDto) {
    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findFirst({ where: { id: attendanceId, deletedAt: null } });
      if (!attendance) throw new NotFoundException('Attendance record not found or has been deleted');

      const newCheckin  = dto.checkinTime  ? new Date(dto.checkinTime)  : attendance.checkinTime;
      const newCheckout = dto.checkoutTime ? new Date(dto.checkoutTime) : attendance.checkoutTime;
      const newShiftId  = dto.shiftId ?? attendance.shiftId;

      // Fetch shift to recalculate isLate, isEarlyOut, workingHours correctly
      const shift = newShiftId
        ? await tx.shift.findUnique({ where: { id: newShiftId }, select: SHIFT_SELECT })
        : null;
      const flags = recomputeFlags(newCheckin, newCheckout, shift);

      // Create auto-approved correction for audit trail
      const correction = await tx.attendanceCorrectionRequest.create({
        data: {
          employeeId: attendance.employeeId!,
          attendanceId,
          requestedCheckinTime: dto.checkinTime ? new Date(dto.checkinTime) : null,
          requestedCheckoutTime: dto.checkoutTime ? new Date(dto.checkoutTime) : null,
          requestedCheckinNote: dto.checkinNote ?? null,
          requestedCheckoutNote: dto.checkoutNote ?? null,
          requestedShiftId: dto.shiftId ?? null,
          originalCheckinTime: attendance.checkinTime,
          originalCheckoutTime: attendance.checkoutTime,
          originalCheckinNote: attendance.checkinNote,
          originalCheckoutNote: attendance.checkoutNote,
          originalShiftId: attendance.shiftId,
          reason: dto.reason,
          status: CORRECTION_STATUS.APPROVED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          checkinTime:  newCheckin,
          checkoutTime: newCheckout,
          checkinNote:  dto.checkinNote  ?? attendance.checkinNote,
          checkoutNote: dto.checkoutNote ?? attendance.checkoutNote,
          shiftId: newShiftId,
          ...flags,
          isCorrected: true,
          correctionRequestId: correction.id,
        },
      });

      return { data: correction, message: 'Attendance record updated', statusCode: 200 };
    });
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async list(query: ListCorrectionQueryDto, requesterId: number, role: string) {
    const { page = 1, limit = 20, status, employeeId, from, to } = query;
    const isAdminOrHr = role === 'admin' || role === 'hr';

    const where: Record<string, unknown> = {};
    if (!isAdminOrHr) where['employeeId'] = requesterId;
    else if (employeeId) where['employeeId'] = employeeId;
    if (status) where['status'] = status;
    if (from || to) {
      where['createdAt'] = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.attendanceCorrectionRequest.count({ where }),
      this.prisma.attendanceCorrectionRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: { select: { id: true, fullName: true, code: true } },
          reviewer: { select: { id: true, fullName: true } },
          attendance: { select: { id: true, date: true } },
          requestedShift: { select: { id: true, name: true, startTime: true, endTime: true } },
          originalShift:  { select: { id: true, name: true, startTime: true, endTime: true } },
        },
      }),
    ]);

    return {
      data: { items, total, page, limit },
      message: 'OK',
      statusCode: 200,
    };
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(id: number, requesterId: number, role: string) {
    const req = await this.prisma.attendanceCorrectionRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, fullName: true, code: true } },
        reviewer: { select: { id: true, fullName: true } },
        attendance: { select: { id: true, date: true } },
        requestedShift: { select: { id: true, name: true, startTime: true, endTime: true } },
        originalShift:  { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });
    if (!req) throw new NotFoundException('Correction request not found');

    const isAdminOrHr = role === 'admin' || role === 'hr';
    if (!isAdminOrHr && req.employeeId !== requesterId)
      throw new ForbiddenException('Access denied');

    return { data: req, message: 'OK', statusCode: 200 };
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private async findPendingOrThrow(tx: any, id: number) {
    const req = await tx.attendanceCorrectionRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Correction request not found');
    if (req.status !== CORRECTION_STATUS.PENDING)
      throw new BadRequestException('Request is not in pending status');
    return req;
  }
}
