import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignDayShiftDto } from './dto/assign-day-shift.dto';
import { BulkAssignRangeDto } from './dto/bulk-assign-range.dto';
import { ListSchedulesQueryDto } from './dto/list-schedules-query.dto';

/** Max allowed date-range span for bulk assign (days) */
const BULK_MAX_DAYS = 92;

/** Parse YYYY-MM-DD → UTC midnight Date (matches @db.Date storage) */
function parseUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Expand [from, to] inclusive into array of UTC-midnight Dates */
function expandDateRange(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

@Injectable()
export class ShiftScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List month schedules ──────────────────────────────────────────────────

  async getMonth(query: ListSchedulesQueryDto, user: { id: number; role: string }) {
    const { year, month, dateFrom, dateTo, departmentId, branchId, employeeId } = query;

    let from: Date, to: Date;
    if (dateFrom && dateTo) {
      from = parseUTCDate(dateFrom);
      to   = parseUTCDate(dateTo);
    } else if (year && month) {
      from = new Date(Date.UTC(year, month - 1, 1));
      to   = new Date(Date.UTC(year, month, 0));
    } else {
      throw new BadRequestException('Provide either year+month or dateFrom+dateTo');
    }

    // Manager scope: force to own department
    let effectiveDeptId = departmentId;
    if (user.role === 'manager') {
      const mgr = await this.prisma.employee.findUnique({
        where: { id: user.id },
        select: { departmentId: true },
      });
      effectiveDeptId = mgr?.departmentId ?? undefined;
    }

    const empWhere: Record<string, unknown> = { status: { not: 'resigned' } };
    if (effectiveDeptId) empWhere.departmentId = effectiveDeptId;
    if (branchId)        empWhere.branchId = branchId;
    if (employeeId)      empWhere.id = employeeId;

    return this.prisma.employeeShiftSchedule.findMany({
      where: {
        date: { gte: from, lte: to },
        employee: empWhere,
      },
      include: {
        shift:    { select: { id: true, name: true, startTime: true, endTime: true } },
        employee: { select: { id: true, code: true, fullName: true, departmentId: true } },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
    });
  }

  // ── My schedules ──────────────────────────────────────────────────────────

  async getShiftsForDate(dateStr: string, employeeId: number) {
    const date = parseUTCDate(dateStr);
    return this.prisma.employeeShiftSchedule.findMany({
      where: { employeeId, date },
      include: { shift: { select: { id: true, name: true, startTime: true, endTime: true } } },
      orderBy: [{ shiftId: 'asc' }],
    });
  }

  async getMine(year: number, month: number, employeeId: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to   = new Date(Date.UTC(year, month, 0));
    return this.prisma.employeeShiftSchedule.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      include: { shift: { select: { id: true, name: true, startTime: true, endTime: true } } },
      orderBy: [{ date: 'asc' }],
    });
  }

  // ── Assign single day ─────────────────────────────────────────────────────

  async assignDay(dto: AssignDayShiftDto, user: { id: number; role: string }) {
    await this.assertCanManageEmployee(dto.employeeId, user.id, user.role);

    const shift = await this.prisma.shift.findUnique({ where: { id: dto.shiftId } });
    if (!shift || !shift.isActive) throw new BadRequestException(`Shift #${dto.shiftId} not found or inactive`);

    const date = parseUTCDate(dto.date);

    return this.prisma.employeeShiftSchedule.upsert({
      where: { employeeId_date_shiftId: { employeeId: dto.employeeId, date, shiftId: dto.shiftId } },
      create: { employeeId: dto.employeeId, shiftId: dto.shiftId, date, note: dto.note, createdById: user.id },
      update: { note: dto.note },
      include: { shift: { select: { id: true, name: true, startTime: true, endTime: true } } },
    });
  }

  // ── Bulk assign range ─────────────────────────────────────────────────────

  async bulkAssignRange(dto: BulkAssignRangeDto, user: { id: number; role: string }) {
    const from = parseUTCDate(dto.dateFrom);
    const to   = parseUTCDate(dto.dateTo);
    if (from > to) throw new BadRequestException('dateFrom must be before dateTo');

    const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (spanDays > BULK_MAX_DAYS) {
      throw new BadRequestException(`Date range too large (max ${BULK_MAX_DAYS} days)`);
    }

    const shift = await this.prisma.shift.findUnique({ where: { id: dto.shiftId } });
    if (!shift || !shift.isActive) throw new BadRequestException(`Shift #${dto.shiftId} not found or inactive`);

    for (const empId of dto.employeeIds) {
      await this.assertCanManageEmployee(empId, user.id, user.role);
    }

    const dates = expandDateRange(from, to);
    const data = dto.employeeIds.flatMap((employeeId) =>
      dates.map((date) => ({ employeeId, shiftId: dto.shiftId, date, note: dto.note, createdById: user.id })),
    );

    const result = await this.prisma.employeeShiftSchedule.createMany({ data, skipDuplicates: true });
    return { created: result.count, requested: data.length };
  }

  // ── Remove entry ──────────────────────────────────────────────────────────

  async removeOne(id: number, user: { id: number; role: string }) {
    const entry = await this.prisma.employeeShiftSchedule.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Schedule entry #${id} not found`);

    await this.assertCanManageEmployee(entry.employeeId, user.id, user.role);

    // Block if attendance record exists for this employee+shift+date
    const hasAttendance = await this.prisma.attendance.findFirst({
      where: { employeeId: entry.employeeId, shiftId: entry.shiftId, date: entry.date, deletedAt: null },
    });
    if (hasAttendance) {
      throw new BadRequestException(
        'Cannot remove: attendance record exists for this shift on this date.',
      );
    }

    await this.prisma.employeeShiftSchedule.delete({ where: { id } });
  }

  // ── Day-off records ───────────────────────────────────────────────────────────

  async listDayOffs(query: { dateFrom: string; dateTo: string; departmentId?: number }, user: { id: number; role: string }) {
    const from = parseUTCDate(query.dateFrom);
    const to   = parseUTCDate(query.dateTo);

    let effectiveDeptId = query.departmentId;
    if (user.role === 'manager') {
      const mgr = await this.prisma.employee.findUnique({ where: { id: user.id }, select: { departmentId: true } });
      effectiveDeptId = mgr?.departmentId ?? undefined;
    }

    const empWhere: Record<string, unknown> = { status: { not: 'resigned' } };
    if (effectiveDeptId) empWhere.departmentId = effectiveDeptId;

    return this.prisma.employeeDayOff.findMany({
      where: { date: { gte: from, lte: to }, employee: empWhere },
      include: { employee: { select: { id: true, code: true, fullName: true } } },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
    });
  }

  async assignDayOff(dto: { employeeId: number; date: string; offType: string; note?: string }, user: { id: number; role: string }) {
    await this.assertCanManageEmployee(dto.employeeId, user.id, user.role);
    const validTypes = ['OFF', 'AL', 'SL', 'H'];
    if (!validTypes.includes(dto.offType)) throw new BadRequestException(`Invalid offType: ${dto.offType}`);
    const date = parseUTCDate(dto.date);
    return this.prisma.employeeDayOff.upsert({
      where:  { employeeId_date: { employeeId: dto.employeeId, date } },
      create: { employeeId: dto.employeeId, date, offType: dto.offType, note: dto.note, createdById: user.id },
      update: { offType: dto.offType, note: dto.note },
      include: { employee: { select: { id: true, code: true, fullName: true } } },
    });
  }

  async removeDayOff(id: number, user: { id: number; role: string }) {
    const entry = await this.prisma.employeeDayOff.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Day-off record #${id} not found`);
    await this.assertCanManageEmployee(entry.employeeId, user.id, user.role);
    await this.prisma.employeeDayOff.delete({ where: { id } });
  }

  // ── Auth helper ───────────────────────────────────────────────────────────

  private async assertCanManageEmployee(employeeId: number, requesterId: number, requesterRole: string) {
    if (requesterRole === 'admin' || requesterRole === 'hr') return;

    if (requesterRole === 'manager') {
      const [manager, emp] = await Promise.all([
        this.prisma.employee.findUnique({ where: { id: requesterId }, select: { departmentId: true } }),
        this.prisma.employee.findUnique({ where: { id: employeeId }, select: { departmentId: true } }),
      ]);
      if (!emp) throw new NotFoundException(`Employee #${employeeId} not found`);
      if (!manager?.departmentId || manager.departmentId !== emp.departmentId) {
        throw new ForbiddenException('You can only manage employees in your department');
      }
      return;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
