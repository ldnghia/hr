import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginate, buildPaginatedResponse } from '../common/dto/pagination.dto';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { CalendarService } from '../calendar/calendar.service';

/** Format a Date using local calendar date (avoids UTC shift when server is UTC+7) */
const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const ATTENDANCE_EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  email: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  office: { select: { id: true, name: true } },
};

@Injectable()
export class AttendanceQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
  ) {}

  // ─── Today status (returns array — multi-shift aware) ────────────────────

  async findTodaySessions(employeeId: number) {
    const now = new Date();
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowVn = new Date(now.getTime() + VN_OFFSET_MS);
    const today = new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()));
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const todayStr = today.toISOString().split('T')[0];

    const [sessions, dayInfo] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          employeeId,
          OR: [
            { date: today },
            // Cross-day shifts (e.g. 23:00–07:00): session date = yesterday but still open
            { date: yesterday, checkinTime: { not: null }, checkoutTime: null },
          ],
        },
        include: { shift: true },
        orderBy: { checkinTime: 'asc' },
      }),
      this.calendarService.checkDay(todayStr),
    ]);

    // Legacy compat: expose first session as `attendance` for existing callers
    const first = sessions[0] ?? null;
    return {
      date: today,
      sessions,
      attendance: first,
      checkedIn: sessions.some((s) => !!s.checkinTime),
      checkedOut: sessions.every((s) => !!s.checkoutTime),
      dayInfo,
    };
  }

  // ─── Monthly summary ──────────────────────────────────────────────────────

  async getSummary(employeeId: number, month: number, year: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));

    const records = await this.prisma.attendance.findMany({
      where: { employeeId, date: { gte: start, lte: end } },
      include: { shift: true },
      orderBy: { date: 'asc' },
    });

    // Sum working hours across all shift sessions
    const totalWorkingHours = records.reduce(
      (acc, r) => acc + (r.workingHours ? Number(r.workingHours) : 0),
      0,
    );

    // Distinct days with at least one check-in
    const daysWithAttendance = new Set(
      records.filter((r) => r.checkinTime).map((r) => localDateStr(new Date(r.date!))),
    ).size;

    return {
      employeeId,
      month,
      year,
      totalDays: daysWithAttendance,
      totalSessions: records.length,
      totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
      records,
    };
  }

  // ─── Paginated list (admin/hr) ────────────────────────────────────────────

  async findAll(query: PaginationDto & { employeeId?: number; date?: string }) {
    const { page = 1, limit = 20, employeeId, date } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (date) where.date = new Date(date);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: {
          employee: { select: ATTENDANCE_EMPLOYEE_SELECT },
          shift: true,
          corrections: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, reason: true, reviewNote: true } },
        },
        skip,
        take,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── My records ───────────────────────────────────────────────────────────

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
        orderBy: [{ date: 'desc' }, { checkinTime: 'asc' }],
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── Daily summary (aggregated per employeeId+date across sessions) ────────

  async getDailySummary(
    requestingUser: { id: number; role: string },
    from?: string,
    to?: string,
    employeeId?: number,
  ) {
    const now = new Date();
    const start = from ? new Date(from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = to ? new Date(to) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    const where: any = { date: { gte: start, lte: end } };

    // RBAC scoping
    if (requestingUser.role === 'employee') {
      where.employeeId = requestingUser.id;
    } else if (requestingUser.role === 'manager') {
      where.OR = [{ employeeId: requestingUser.id }, { employee: { managerId: requestingUser.id } }];
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    const sessions = await this.prisma.attendance.findMany({
      where,
      include: { shift: true },
      orderBy: [{ date: 'asc' }, { checkinTime: 'asc' }],
    });

    // Group by (employeeId, date)
    const groupMap = new Map<string, {
      date: Date;
      employeeId: number;
      totalHours: number;
      sessionsCount: number;
      sessions: typeof sessions;
    }>();

    for (const s of sessions) {
      if (!s.date || s.employeeId == null) continue;
      const key = `${s.employeeId}__${s.date.toISOString().split('T')[0]}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { date: s.date, employeeId: s.employeeId, totalHours: 0, sessionsCount: 0, sessions: [] });
      }
      const group = groupMap.get(key)!;
      group.totalHours += s.workingHours ? Number(s.workingHours) : 0;
      group.sessionsCount += 1;
      group.sessions.push(s);
    }

    return {
      data: [...groupMap.values()].map((g) => ({
        ...g,
        totalHours: parseFloat(g.totalHours.toFixed(2)),
      })),
    };
  }

  // ─── Unclosed sessions (checkin without checkout from previous days) ──────

  async getUnclosedSessions(employeeId: number) {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const sessions = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        checkinTime: { not: null },
        checkoutTime: null,
        forgotCheckout: false,
        date: { lt: todayUtc },
      },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true, isCrossDay: true } },
      },
      orderBy: { date: 'desc' },
    });

    // Exclude cross-day sessions that are still within their active window.
    // e.g. shift 23:00–06:00: if current time is 01:30, worker is still in shift
    // → do NOT show in unclosed banner until past shift end time.
    const currentHHMM = now.getHours() * 60 + now.getMinutes();
    const filtered = sessions.filter((s) => {
      if (!s.shift?.isCrossDay) return true; // non-cross-day: always show if unclosed

      // Parse shift end time (HH:MM) into minutes
      const [endH, endM] = (s.shift.endTime ?? '00:00').split(':').map(Number);
      const endMinutes = endH * 60 + endM;

      // Session is still active if current time hasn't passed the shift end time today
      // (cross-day shift ends in the morning of the next day)
      const stillActive = currentHHMM < endMinutes;
      return !stillActive; // exclude if still active
    });

    return { data: filtered };
  }

  // ─── My shifts for current month ─────────────────────────────────────────

  async getMyShiftsCurrentMonth(employeeId: number) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Fetch employee details to determine workingMode and department
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        workingMode: true,
        departmentId: true,
        shiftId: true,
        currentShift: { select: { id: true, name: true, startTime: true, endTime: true, code: true } },
      },
    });

    // SHIFT employees: show all active shifts for their department so they can
    // pick which shift to check in for (rotating schedule, no fixed default).
    if (emp?.workingMode === 'SHIFT' && emp.departmentId) {
      const deptShifts = await this.prisma.shift.findMany({
        where: { departmentId: emp.departmentId, isActive: true },
        select: { id: true, name: true, startTime: true, endTime: true, code: true },
        orderBy: { startTime: 'asc' },
      });

      if (deptShifts.length > 0) {
        return {
          data: deptShifts.map((s) => ({
            shiftId: s.id,
            shiftName: s.name,
            startTime: s.startTime,
            endTime: s.endTime,
            code: s.code,
          })),
        };
      }
    }

    // FIXED employees: use monthly shift assignment matrix
    const assignments = await this.prisma.employeeShiftAssignment.findMany({
      where: { employeeId, year, month },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true, code: true } },
      },
      orderBy: { shiftId: 'asc' },
    });

    if (assignments.length > 0) {
      return {
        data: assignments.map((a) => ({
          shiftId: a.shiftId,
          shiftName: a.shift.name,
          startTime: a.shift.startTime,
          endTime: a.shift.endTime,
          code: a.shift.code,
        })),
      };
    }

    // No monthly assignment — fall back to the employee's default shift,
    // then to the system-wide isDefault shift.
    const defaultShift =
      emp?.currentShift ??
      (await this.prisma.shift.findFirst({
        where: { isDefault: true, isActive: true },
        select: { id: true, name: true, startTime: true, endTime: true, code: true },
      }));

    if (!defaultShift) return { data: [] };

    return {
      data: [{
        shiftId: defaultShift.id,
        shiftName: defaultShift.name,
        startTime: defaultShift.startTime,
        endTime: defaultShift.endTime,
        code: defaultShift.code,
      }],
    };
  }

  // ─── Report (with RBAC + filters) ────────────────────────────────────────

  async getReport(
    dto: ReportAttendanceDto,
    user: { id: number; role: string },
    workingMode?: 'FIXED' | 'SHIFT',
  ) {
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

    // RBAC scoping
    if (user.role === 'manager') {
      where.AND.push({
        OR: [{ employeeId: user.id }, { employee: { managerId: user.id } }],
      });
    } else if (user.role === 'employee') {
      where.AND.push({ employeeId: user.id });
    }

    if (employeeId) where.AND.push({ employeeId });
    if (departmentId) where.AND.push({ employee: { departmentId } });
    if (workingMode) where.AND.push({ employee: { workingMode } });

    if (dateFrom || dateTo) {
      const dateFilter: any = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.AND.push({ date: dateFilter });
    }

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
          shift: true,
          corrections: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, reason: true, reviewNote: true } },
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
}
