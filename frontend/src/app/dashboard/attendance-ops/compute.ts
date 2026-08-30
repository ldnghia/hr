import type { AttendanceRecord, Employee } from '@/types';

// ─── Local date helpers (avoid UTC day-boundary shift) ─────────────────────────

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return ymd(new Date());
}

/** Last 7 calendar dates ending today, oldest first. */
export function last7Dates(): string[] {
  const days: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    days.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ─── Today snapshot ─────────────────────────────────────────────────────────────

export type RosterStatus = 'onTime' | 'late' | 'pending' | 'absent' | 'leave';

export interface RosterEntry {
  employeeId: number;
  fullName: string;
  code: string;
  deptName: string;
  status: RosterStatus;
  checkinTime?: string;
  lateMinutes?: number;
}

export interface DeptStat {
  name: string;
  total: number;
  presentRate: number; // % checked in (on-time + late) among roster for this dept
}

export interface TodaySnapshot {
  totalEmployees: number;
  workingToday: number;
  present: number;
  late: number;
  pending: number;
  absent: number;
  onLeave: number;
  roster: RosterEntry[];
  byDept: DeptStat[];
}

interface LeaveRange { employeeId: number; fromDate: string; toDate: string }

/**
 * Builds today's roster from the full employee list + today's attendance records.
 * FIXED-mode employees are tracked every day, including weekends. SHIFT-mode (CC)
 * employees rotate shifts, so they're only counted when EmployeeShiftSchedule
 * actually assigns them a shift today — otherwise a normal rotation day-off would
 * be miscounted as "absent".
 *
 * Employees with no check-in are split into 'pending' (their shift hasn't started
 * yet — expectedStartByEmp + nowHM decide this) vs 'absent' (shift already started,
 * still no check-in). Without a known shift start time, they default to 'absent'.
 */
export function computeTodaySnapshot(
  employees: Employee[],
  records: AttendanceRecord[],
  leaveRanges: LeaveRange[],
  scheduledEmpIds: Set<number>,
  expectedStartByEmp: Map<number, string>,
  nowHM: string,
  today: string,
): TodaySnapshot {
  const recByEmp = new Map<number, AttendanceRecord[]>();
  records.forEach((r) => {
    if (!recByEmp.has(r.employeeId)) recByEmp.set(r.employeeId, []);
    recByEmp.get(r.employeeId)!.push(r);
  });

  const leaveEmpIds = new Set(
    leaveRanges
      .filter((l) => today >= l.fromDate.slice(0, 10) && today <= l.toDate.slice(0, 10))
      .map((l) => l.employeeId),
  );

  const roster: RosterEntry[] = [];
  const deptTotals = new Map<string, { total: number; present: number }>();

  for (const emp of employees) {
    const recs = recByEmp.get(emp.id) ?? [];
    const onLeave = leaveEmpIds.has(emp.id) || recs.some((r) => r.isOnLeave);
    const checkinRec = recs.find((r) => r.checkinTime);
    const hasCheckin = !!checkinRec;
    const isLate = recs.some((r) => r.isLate && r.checkinTime);

    // Not expected to work today — skip entirely (not counted as absent):
    // SHIFT employees are off whenever they have no shift assigned today.
    // FIXED employees are tracked every day, including weekends.
    if (!onLeave && !hasCheckin && emp.workingMode === 'SHIFT' && !scheduledEmpIds.has(emp.id)) {
      continue;
    }

    let status: RosterStatus;
    if (onLeave) status = 'leave';
    else if (hasCheckin) status = isLate ? 'late' : 'onTime';
    else {
      const expectedStart = expectedStartByEmp.get(emp.id);
      status = expectedStart && nowHM < expectedStart ? 'pending' : 'absent';
    }
    const deptName = emp.department?.name ?? 'Chưa gán phòng ban';

    roster.push({
      employeeId: emp.id,
      fullName: emp.fullName,
      code: emp.code,
      deptName,
      status,
      checkinTime: checkinRec?.checkinTime,
    });

    if (status !== 'leave') {
      const bucket = deptTotals.get(deptName) ?? { total: 0, present: 0 };
      bucket.total += 1;
      if (status === 'onTime' || status === 'late') bucket.present += 1;
      deptTotals.set(deptName, bucket);
    }
  }

  const byDept: DeptStat[] = [...deptTotals.entries()]
    .map(([name, { total, present }]) => ({
      name,
      total,
      presentRate: total > 0 ? Math.round((present / total) * 100) : 0,
    }))
    .sort((a, b) => a.presentRate - b.presentRate);

  return {
    totalEmployees: employees.length,
    workingToday: roster.length,
    present: roster.filter((r) => r.status === 'onTime' || r.status === 'late').length,
    late: roster.filter((r) => r.status === 'late').length,
    pending: roster.filter((r) => r.status === 'pending').length,
    absent: roster.filter((r) => r.status === 'absent').length,
    onLeave: roster.filter((r) => r.status === 'leave').length,
    roster: roster.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    byDept,
  };
}

// ─── Weekly trend ────────────────────────────────────────────────────────────

export interface DayTrend {
  dateStr: string;
  dow: number;
  rate: number; // on-time % among that day's check-ins
  checkins: number;
}

export function computeWeeklyTrend(records: AttendanceRecord[], days: string[]): DayTrend[] {
  const byDate = new Map<string, AttendanceRecord[]>();
  records.forEach((r) => {
    const key = ymd(new Date(r.date));
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(r);
  });

  return days.map((dateStr) => {
    const recs = byDate.get(dateStr) ?? [];
    const checkins = recs.filter((r) => r.checkinTime).length;
    const onTime = recs.filter((r) => r.checkinTime && !r.isLate).length;
    return {
      dateStr,
      dow: new Date(`${dateStr}T00:00:00`).getDay(),
      rate: checkins > 0 ? Math.round((onTime / checkins) * 100) : 0,
      checkins,
    };
  });
}
