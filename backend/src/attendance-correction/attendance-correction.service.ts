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

function computeWorkingHours(checkin?: Date | null, checkout?: Date | null): number {
  if (!checkin || !checkout) return 0;
  return parseFloat(((checkout.getTime() - checkin.getTime()) / 3_600_000).toFixed(2));
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
      const attendance = await tx.attendance.findUnique({
        where: { id: dto.attendanceId },
      });
      if (!attendance) throw new NotFoundException('Attendance record not found');
      if (attendance.employeeId !== employeeId)
        throw new ForbiddenException('Not your attendance record');

      const activeCorrection = await tx.attendanceCorrectionRequest.findFirst({
        where: {
          attendanceId: dto.attendanceId,
          status: CORRECTION_STATUS.PENDING,
        },
      });
      if (activeCorrection)
        throw new BadRequestException('A pending correction already exists for this record. Please wait for it to be reviewed or cancel it first.');

      await this.limitService.assertWithinLimit(employeeId, tx as unknown as PrismaService);

      const request = await tx.attendanceCorrectionRequest.create({
        data: {
          employeeId,
          attendanceId: dto.attendanceId,
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

      const attendance = await tx.attendance.findUnique({ where: { id: req.attendanceId } });
      if (!attendance) throw new NotFoundException('Attendance record not found');

      const newCheckin = req.requestedCheckinTime ?? attendance.checkinTime;
      const newCheckout = req.requestedCheckoutTime ?? attendance.checkoutTime;
      const workingHours = computeWorkingHours(newCheckin, newCheckout);

      await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          checkinTime: newCheckin,
          checkoutTime: newCheckout,
          checkinNote: req.requestedCheckinNote ?? attendance.checkinNote,
          checkoutNote: req.requestedCheckoutNote ?? attendance.checkoutNote,
          shiftId: req.requestedShiftId ?? attendance.shiftId,
          workingHours,
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
      const attendance = await tx.attendance.findUnique({ where: { id: attendanceId } });
      if (!attendance) throw new NotFoundException('Attendance record not found');

      const newCheckin = dto.checkinTime ? new Date(dto.checkinTime) : attendance.checkinTime;
      const newCheckout = dto.checkoutTime
        ? new Date(dto.checkoutTime)
        : attendance.checkoutTime;
      const workingHours = computeWorkingHours(newCheckin, newCheckout);

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
          checkinTime: newCheckin,
          checkoutTime: newCheckout,
          checkinNote: dto.checkinNote ?? attendance.checkinNote,
          checkoutNote: dto.checkoutNote ?? attendance.checkoutNote,
          shiftId: dto.shiftId ?? attendance.shiftId,
          workingHours,
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
          requestedShift: { select: { id: true, name: true } },
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
        requestedShift: { select: { id: true, name: true } },
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
