/**
 * AttendanceService — thin orchestrator.
 *
 * Business logic is split into focused sub-services:
 *   - AttendanceCheckinService  → checkIn / checkOut
 *   - AttendanceQueryService    → queries / report / summary
 *   - AttendanceExportService   → Excel exports
 *
 * This class delegates to those services and preserves the public API expected
 * by AttendanceController without changing any method signatures.
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { AttendanceCheckinService } from './attendance-checkin.service';
import { AttendanceQueryService } from './attendance-query.service';
import { AttendanceExportService } from './attendance-export.service';
import { computeSessionHours, computeSessionDate } from './helpers/session-hours';
import { Response } from 'express';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkinService: AttendanceCheckinService,
    private readonly queryService: AttendanceQueryService,
    private readonly exportService: AttendanceExportService,
  ) {}

  // ─── WFM: Check-in / Check-out ────────────────────────────────────────────

  checkIn(employeeId: number, dto: CheckInDto, ipAddress?: string) {
    return this.checkinService.checkIn(employeeId, dto, ipAddress);
  }

  checkOut(employeeId: number, dto: CheckOutDto, ipAddress?: string) {
    return this.checkinService.checkOut(employeeId, dto, ipAddress);
  }

  // ─── Legacy manual check (no GPS, no shift resolution) ───────────────────

  async checkInOut(employeeId: number, type: 'check_in' | 'check_out', timestamp?: string) {
    const ts = timestamp ? new Date(timestamp) : new Date();
    const dateOnly = computeSessionDate(ts);

    let attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, date: dateOnly, deletedAt: null },
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
      const shift = attendance.shiftId
        ? await this.prisma.shift.findUnique({ where: { id: attendance.shiftId } })
        : null;
      const workingHours = computeSessionHours(attendance.checkinTime, ts, shift);
      attendance = await this.prisma.attendance.update({
        where: { id: attendance.id },
        data: { checkoutTime: ts, workingHours },
      });
    }

    return attendance;
  }

  // ─── Raw import ───────────────────────────────────────────────────────────

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

  // ─── Queries ──────────────────────────────────────────────────────────────

  findAll(query: PaginationDto & { employeeId?: number; date?: string }) {
    return this.queryService.findAll(query);
  }

  /** @deprecated use findTodaySessions for multi-shift support */
  findTodayStatus(employeeId: number) {
    return this.queryService.findTodaySessions(employeeId);
  }

  findTodaySessions(employeeId: number) {
    return this.queryService.findTodaySessions(employeeId);
  }

  getDailySummary(
    user: { id: number; role: string },
    from?: string,
    to?: string,
    employeeId?: number,
  ) {
    return this.queryService.getDailySummary(user, from, to, employeeId);
  }

  getUnclosedSessions(employeeId: number) {
    return this.queryService.getUnclosedSessions(employeeId);
  }

  markForgotCheckout(employeeId: number, attendanceId: number) {
    return this.checkinService.markForgotCheckout(employeeId, attendanceId);
  }

  getMyShiftsCurrentMonth(employeeId: number) {
    return this.queryService.getMyShiftsCurrentMonth(employeeId);
  }

  getSummary(employeeId: number, month: number, year: number) {
    return this.queryService.getSummary(employeeId, month, year);
  }

  getReport(dto: ReportAttendanceDto, user: { id: number; role: string }) {
    return this.queryService.getReport(dto, user);
  }

  getMyRecords(
    employeeId: number,
    query: PaginationDto & { dateFrom?: string; dateTo?: string },
  ) {
    return this.queryService.getMyRecords(employeeId, query);
  }

  deleteAttendance(id: number) {
    return this.queryService.deleteAttendance(id);
  }

  // ─── Exports ──────────────────────────────────────────────────────────────

  exportReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.exportService.exportReport(dto, user, res);
  }

  exportGridReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.exportService.exportGridReport(dto, user, res);
  }

  exportSummaryReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.exportService.exportSummaryReport(dto, user, res);
  }
}
