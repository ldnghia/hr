'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { attendanceService } from '@/services/attendance.service';
import { employeeService } from '@/services/employee.service';
import { organizationService } from '@/services/organization.service';
import { correctionService } from '@/services/attendance-correction.service';
import { shiftScheduleService } from '@/services/shift-schedule.service';
import { PageSpinner } from '@/components/ui/Spinner';
import type { Employee, Department, AttendanceRecord } from '@/types';
import {
  type EmployeeRow, type DayCell, type CellStatus, type MonthlySummary,
  type ShiftEntry, type CorrectionStatus,
  VN_HOLIDAYS, deriveCellStatus, deriveShiftCode, isoDateStr, countWorkingDays,
  initials, avatarGradient,
} from './admin-attendance-report-types';
import { AdminAttendanceKpiStrip } from './admin-attendance-kpi-strip';
import { AdminAttendanceGridView } from './admin-attendance-grid-view';
import { AdminAttendanceCcGridView } from './admin-attendance-cc-grid-view';
import { AdminAttendanceDetailView } from './admin-attendance-detail-view';
import { exportEmployeeDailyLogExcel } from './admin-attendance-detail-export';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const TODAY = new Date();

/** Compute net working hours = (checkout - checkin) - breakMinutes. */
function calcNetHours(ci: Date | null, co: Date | null, breakMinutes = 0): number {
  if (!ci || !co) return 0;
  const rawH = (co.getTime() - ci.getTime()) / 3_600_000;
  return Math.max(0, parseFloat((rawH - breakMinutes / 60).toFixed(2)));
}

/** Compute expected net hours for a shift (shift span - break). */
function calcNormalHours(shift?: { startTime?: string; endTime?: string; breakMinutes?: number } | null): number {
  if (!shift?.startTime || !shift?.endTime) return 0;
  const [sh, sm] = shift.startTime.split(':').map(Number);
  const [eh, em] = shift.endTime.split(':').map(Number);
  let spanMin = eh * 60 + em - (sh * 60 + sm);
  if (spanMin <= 0) spanMin += 1440; // cross-day shift
  return Math.max(0, parseFloat(((spanMin - (shift.breakMinutes ?? 0)) / 60).toFixed(2)));
}

/**
 * Late/early minutes from raw check-in/check-out clock time vs shift start/end.
 * Anchors the expected start/end to the actual checkin/checkout calendar date instead of
 * doing hour-of-day arithmetic, so cross-day shifts (e.g. 14:00–00:30) don't produce a huge
 * bogus "early" number when checkout lands after midnight (naive minute-of-day diff would
 * compare 00:24 against 23:00 as if both were the same day).
 */
function calcLateEarlyMinutes(
  ci: Date | null,
  co: Date | null,
  shift?: { startTime?: string; endTime?: string; isCrossDay?: boolean } | null,
): { late: number; early: number } {
  let late = 0;
  let early = 0;
  if (!shift?.startTime) return { late, early };

  const [sh, sm] = shift.startTime.split(':').map(Number);
  let expectedStart: Date | null = null;
  if (ci) {
    expectedStart = new Date(ci);
    expectedStart.setHours(sh, sm, 0, 0);
    late = Math.max(0, Math.round((ci.getTime() - expectedStart.getTime()) / 60_000));
  }

  if (co && shift.endTime) {
    const [eh, em] = shift.endTime.split(':').map(Number);
    const expectedEnd = new Date(expectedStart ?? co);
    expectedEnd.setHours(eh, em, 0, 0);
    if (shift.isCrossDay && expectedEnd.getTime() <= (expectedStart ?? expectedEnd).getTime()) {
      expectedEnd.setDate(expectedEnd.getDate() + 1);
    }
    early = Math.max(0, Math.round((expectedEnd.getTime() - co.getTime()) / 60_000));
  }

  return { late, early };
}

interface ApprovedLeave {
  id: number; employeeId: number;
  fromDate: string; toDate: string;
  type: string; isHalfDay: boolean;
  shiftId: number | null; halfDaySession: string | null;
}

function buildEmployeeRows(
  employees: Employee[],
  records: AttendanceRecord[],
  year: number,
  month: number,
  corrMap: Map<number, CorrectionStatus>,
  approvedLeaves: ApprovedLeave[] = [],
): EmployeeRow[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayMs = TODAY.getTime();

  // Derive VN calendar date (UTC+7) from a UTC timestamp string
  const vnDateStr = (isoStr: string): string => {
    const vnTs = new Date(new Date(isoStr).getTime() + 7 * 60 * 60 * 1000);
    return `${vnTs.getUTCFullYear()}-${String(vnTs.getUTCMonth() + 1).padStart(2, '0')}-${String(vnTs.getUTCDate()).padStart(2, '0')}`;
  };

  // Index records: employeeId → dateStr → all records (supports multi-shift per day)
  // Use VN date of checkinTime (authoritative) to avoid UTC midnight day-boundary shift.
  const recMap = new Map<number, Map<string, AttendanceRecord[]>>();
  for (const r of records) {
    const ds = r.checkinTime ? vnDateStr(r.checkinTime) : r.date?.split('T')[0];
    if (!ds) continue;
    if (!recMap.has(r.employeeId)) recMap.set(r.employeeId, new Map());
    const dayMap = recMap.get(r.employeeId)!;
    if (!dayMap.has(ds)) dayMap.set(ds, []);
    dayMap.get(ds)!.push(r);
  }

  // Index approved leaves: employeeId → Set of dateStr strings covered by the leave range
  // Used to show P on days where no attendance record exists (leave before shift assignment)
  const leaveMap = new Map<number, Map<string, ApprovedLeave>>();
  for (const lv of approvedLeaves) {
    const from = new Date(lv.fromDate);
    const to   = new Date(lv.toDate);
    const cursor = new Date(from);
    while (cursor <= to) {
      const ds = cursor.toISOString().split('T')[0];
      if (!leaveMap.has(lv.employeeId)) leaveMap.set(lv.employeeId, new Map());
      // Keep first leave found per day (multiple leaves on same day is invalid)
      if (!leaveMap.get(lv.employeeId)!.has(ds)) {
        leaveMap.get(lv.employeeId)!.set(ds, lv);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // Helper: format ISO time string to HH:MM
  const fmtT = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;

  return employees.map((emp) => {
    const empRecords = recMap.get(emp.id) ?? new Map<string, AttendanceRecord[]>();
    const cells: DayCell[] = [];
    let totalLateMin = 0; let totalOtHours = 0;
    let lateDays = 0; let absentDays = 0; let otDays = 0; let okDays = 0; let annualDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = isoDateStr(year, month, d);
      const date = new Date(year, month - 1, d);
      const dow = date.getDay();
      const isFuture = date.getTime() > todayMs;
      const holidayName = VN_HOLIDAYS[ds];
      const dayRecs = empRecords.get(ds) ?? [];
      const rec = dayRecs[0]; // first record (used for FIXED mode + non-workday logic)

      let status: CellStatus;
      let cell: DayCell;

      const isWeekend = dow === 0 || dow === 6; // Sunday or Saturday
      // SHIFT (ca xoay) employees can work on weekends — rest days come from shift schedule.
      // FIXED employees treat Sat/Sun as automatic off days.
      const isShift = emp.workingMode === 'SHIFT';

      if (isFuture) {
        const leaveRec = dayRecs.find(r => r.isOnLeave);
        if (leaveRec) {
          // Attendance already marked as leave for this future day (FIXED or SHIFT) → count it now,
          // don't wait for the day to "arrive" — the approval already happened.
          const lt = leaveRec.leaveRequest?.type ?? 'annual';
          status = lt === 'unpaid' ? 'unpaid' : lt === 'annual' ? 'annual' : 'special';
          annualDays += leaveRec.leaveRequest?.isHalfDay ? 0.5 : 1;
          const leaveShiftEntries: ShiftEntry[] = dayRecs.map(r => ({
            shiftCode: deriveShiftCode(r.shift),
            shiftName: r.shift?.name,
            checkinTime: null,
            checkoutTime: null,
            status,
          }));
          cell = {
            dateStr: ds, day: d, dow, status,
            leaveType: lt,
            isHalfDay: leaveRec.leaveRequest?.isHalfDay ?? false,
            attendanceId: leaveRec.id,
            ...(leaveShiftEntries.length > 0 ? { shifts: leaveShiftEntries } : {}),
          };
          cells.push(cell);
          continue;
        }
        // CC employees can have approved leave on future days with no attendance row yet — check leaveMap
        const empLeaveDay = isShift ? leaveMap.get(emp.id)?.get(ds) : undefined;
        if (empLeaveDay) {
          // No attendance record yet but approved leave exists → show leave status
          const lt = empLeaveDay.type;
          status = lt === 'unpaid' ? 'unpaid' : lt === 'annual' ? 'annual' : 'special';
          annualDays += empLeaveDay.isHalfDay ? 0.5 : 1;
          cell = { dateStr: ds, day: d, dow, status, leaveType: lt, isHalfDay: empLeaveDay.isHalfDay };
        } else {
          status = (!isShift && isWeekend) || holidayName ? (holidayName ? 'holiday' : 'off') : 'future';
          cell = { dateStr: ds, day: d, dow, status, holidayName };
        }
      } else if (holidayName) {
        status = 'holiday';
        cell = {
          dateStr: ds, day: d, dow, status, holidayName, note: holidayName,
          checkinNote: rec?.checkinNote ?? null,
          checkoutNote: rec?.checkoutNote ?? null,
          locationNote: rec?.locationNote ?? null,
          correctionReason: rec?.corrections?.[0]?.reason ?? null,
          correctionReviewNote: rec?.corrections?.[0]?.reviewNote ?? null,
          checkinTime: fmtT(rec?.checkinTime),
          checkoutTime: fmtT(rec?.checkoutTime),
          attendanceId: rec?.id,
          isCorrected: rec?.isCorrected,
          correctionStatus: rec?.id ? corrMap.get(rec.id) : undefined,
        };
      } else if (!isShift && isWeekend && rec?.isOnLeave) {
        // Weekend with an approved-leave attendance row: render as leave, same as weekdays.
        const lt = rec.leaveRequest?.type ?? 'annual';
        status = lt === 'unpaid' ? 'unpaid' : lt === 'annual' ? 'annual' : 'special';
        annualDays += rec.leaveRequest?.isHalfDay ? 0.5 : 1;
        cell = {
          dateStr: ds, day: d, dow, status,
          leaveType: lt,
          isHalfDay: rec.leaveRequest?.isHalfDay ?? false,
          attendanceId: rec.id,
        };
        cells.push(cell);
        continue;
      } else if (!isShift && isWeekend) {
        // Fixed-schedule employees: weekend off unless they have a record
        status = rec ? deriveCellStatus(rec) : 'off';
        cell = {
          dateStr: ds, day: d, dow, status,
          checkinTime: fmtT(rec?.checkinTime),
          checkoutTime: fmtT(rec?.checkoutTime),
          otHours: rec?.overtimeHours ? parseFloat(String(rec.overtimeHours)) : 0,
          attendanceId: rec?.id,
          // Include notes even for weekend records
          checkinNote: rec?.checkinNote ?? null,
          checkoutNote: rec?.checkoutNote ?? null,
          locationNote: rec?.locationNote ?? null,
          correctionReason: rec?.corrections?.[0]?.reason ?? null,
          correctionReviewNote: rec?.corrections?.[0]?.reviewNote ?? null,
          isCorrected: rec?.isCorrected,
          correctionStatus: rec?.id ? corrMap.get(rec.id) : undefined,
        };
      } else if (rec) {
        // Leave records take priority: isOnLeave=true overrides attendance status
        if (rec.isOnLeave) {
          const lt = rec.leaveRequest?.type ?? 'annual';
          status = lt === 'unpaid' ? 'unpaid' : lt === 'annual' ? 'annual' : 'special';
          annualDays += rec.leaveRequest?.isHalfDay ? 0.5 : 1;
          // Build shift entries so CC grid can render P in the correct S/C/D slot
          const leaveShiftEntries: ShiftEntry[] = dayRecs.map(r => ({
            shiftCode: deriveShiftCode(r.shift),
            shiftName: r.shift?.name,
            checkinTime: null,
            checkoutTime: null,
            status,
          }));
          cell = {
            dateStr: ds, day: d, dow, status,
            leaveType: lt,
            isHalfDay: rec.leaveRequest?.isHalfDay ?? false,
            attendanceId: rec.id,
            ...(leaveShiftEntries.length > 0 ? { shifts: leaveShiftEntries } : {}),
          };
          cells.push(cell);
          continue;
        }
        status = deriveCellStatus(rec);
        // Calculate late/early from timestamps
        const co = rec.checkoutTime ? new Date(rec.checkoutTime) : null;
        const ci = rec.checkinTime ? new Date(rec.checkinTime) : null;
        const { late: lateMinutes, early: earlyMinutes } = calcLateEarlyMinutes(ci, co, rec.shift);

        const otH = rec.overtimeHours ? parseFloat(String(rec.overtimeHours)) : 0;
        cell = {
          dateStr: ds, day: d, dow, status,
          checkinTime: ci ? ci.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null,
          checkoutTime: co ? co.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null,
          lateMinutes, earlyMinutes, otHours: otH,
          workingHours: calcNetHours(ci, co, rec.shift?.breakMinutes),
          normalHours: calcNormalHours(rec.shift),
          hasNoCheckout: !!rec.checkinTime && !rec.checkoutTime,
          attendanceId: rec.id,
          correctionStatus: rec.id ? corrMap.get(rec.id) : undefined,
          isCorrected: rec.isCorrected,
          isInOffice: rec.isInOffice,
          officeDistanceM: rec.officeDistanceM,
          hasCheckinGps: rec.checkinLat != null,
          checkoutIsInOffice: rec.checkoutIsInOffice,
          checkoutOfficeDistanceM: rec.checkoutOfficeDistanceM,
          hasCheckoutGps: rec.checkoutLat != null,
          checkinNote: rec.checkinNote ?? null,
          checkoutNote: rec.checkoutNote ?? null,
          locationNote: rec.locationNote ?? null,
          lateReason: rec.lateReason ?? null,
          earlyReason: rec.earlyReason ?? null,
          correctionReason: rec.corrections?.[0]?.reason ?? null,
          correctionReviewNote: rec.corrections?.[0]?.reviewNote ?? null,
          // Overlay half-day leave info even when employee actually checked in
          ...(rec.leaveRequest ? {
            leaveType: rec.leaveRequest.type,
            isHalfDay: rec.leaveRequest.isHalfDay ?? false,
          } : {}),
        };

        if (status === 'late')   { lateDays++; totalLateMin += lateMinutes; }
        if (status === 'early')  { /* counted separately */ }
        if (status === 'ot')     { otDays++; totalOtHours += otH; }
        else if (otH > 0)        { totalOtHours += otH; otDays++; }
        if (status === 'ok')     okDays++;
        if (status === 'annual') annualDays++;
        if (status === 'absent') absentDays++;
        // Count half-day leave separately (employee worked + took half-day leave)
        if (rec.leaveRequest?.isHalfDay) annualDays += 0.5;
      } else if (isShift) {
        // Check for approved leave covering this date even when no attendance record exists
        // (CC employees request leave before shift assignment — no EmployeeShiftSchedule on that day)
        const empLeaveDay = leaveMap.get(emp.id)?.get(ds);
        if (empLeaveDay) {
          const lt = empLeaveDay.type;
          status = lt === 'unpaid' ? 'unpaid' : lt === 'annual' ? 'annual' : 'special';
          annualDays += empLeaveDay.isHalfDay ? 0.5 : 1;
          cell = {
            dateStr: ds, day: d, dow, status,
            leaveType: lt,
            isHalfDay: empLeaveDay.isHalfDay,
          };
        } else {
          // Shift employee with no record and no leave → scheduled rest day
          status = 'off';
          cell = { dateStr: ds, day: d, dow, status };
        }
      } else {
        // Fixed employee with no attendance record — check approved leave before defaulting to absent
        // (e.g. leave approved but the attendance-marking job hasn't run for this day yet)
        const empLeaveDay = leaveMap.get(emp.id)?.get(ds);
        if (empLeaveDay) {
          const lt = empLeaveDay.type;
          status = lt === 'unpaid' ? 'unpaid' : lt === 'annual' ? 'annual' : 'special';
          annualDays += empLeaveDay.isHalfDay ? 0.5 : 1;
          cell = { dateStr: ds, day: d, dow, status, leaveType: lt, isHalfDay: empLeaveDay.isHalfDay };
        } else {
          status = 'absent';
          absentDays++;
          cell = { dateStr: ds, day: d, dow, status };
        }
      }

      // Build ShiftEntry array from all day records (for CC/SHIFT grid display)
      if (dayRecs.length > 0) {
        const shiftEntries: ShiftEntry[] = dayRecs.map(r => {
          // Leave records: show P status, no checkin/checkout times
          if (r.isOnLeave) {
            const lt = r.leaveRequest?.type ?? 'annual';
            const leaveStatus: CellStatus = lt === 'unpaid' ? 'unpaid' : lt === 'annual' ? 'annual' : 'special';
            return {
              shiftCode: deriveShiftCode(r.shift),
              shiftName: r.shift?.name,
              checkinTime: null,
              checkoutTime: null,
              status: leaveStatus,
              isHalfDay: r.leaveRequest?.isHalfDay ?? false,
              attendanceId: r.id,
            };
          }
          const s = deriveCellStatus(r);
          const ci = r.checkinTime ? new Date(r.checkinTime) : null;
          const co = r.checkoutTime ? new Date(r.checkoutTime) : null;
          const { late, early } = calcLateEarlyMinutes(ci, co, r.shift);
          return {
            shiftCode: deriveShiftCode(r.shift),
            shiftName: r.shift?.name,
            checkinTime: fmtT(r.checkinTime),
            checkoutTime: fmtT(r.checkoutTime),
            status: s,
            lateMinutes: late,
            earlyMinutes: early,
            otHours: r.overtimeHours ? parseFloat(String(r.overtimeHours)) : 0,
            // Use backend-computed DB value (authoritative). Fallback caps at 24h to guard
            // against UTC day-boundary bugs where raw timestamps span midnight incorrectly.
            workingHours: (() => {
              if (r.workingHours != null) return parseFloat(String(r.workingHours));
              const h = calcNetHours(ci, co, r.shift?.breakMinutes);
              return h > 24 ? 0 : h;
            })(),
            normalHours: calcNormalHours(r.shift),
            hasNoCheckout: !!r.checkinTime && !r.checkoutTime,
            attendanceId: r.id,
            correctionStatus: r.id ? corrMap.get(r.id) : undefined,
            isInOffice: r.isInOffice,
            officeDistanceM: r.officeDistanceM,
            hasCheckinGps: r.checkinLat != null,
            checkoutIsInOffice: r.checkoutIsInOffice,
            checkoutOfficeDistanceM: r.checkoutOfficeDistanceM,
            hasCheckoutGps: r.checkoutLat != null,
            checkinNote: r.checkinNote ?? null,
            checkoutNote: r.checkoutNote ?? null,
            lateReason: r.lateReason ?? null,
            earlyReason: r.earlyReason ?? null,
          };
        });

        // Overlay half-day leave info from any leave record in dayRecs (not just rec/dayRecs[0])
        const anyLeaveRec = dayRecs.find(r => r.isOnLeave && r.leaveRequest);
        const leaveOverlay = anyLeaveRec ? {
          leaveType: anyLeaveRec.leaveRequest!.type,
          isHalfDay: anyLeaveRec.leaveRequest!.isHalfDay ?? false,
        } : {};

        // If cell was set to 'future' or 'off' by the date branch but actually has a leave record,
        // promote the cell status to the leave status so the CC grid renders P instead of ·
        const lt2 = anyLeaveRec?.leaveRequest?.type;
        const statusOverride: Partial<DayCell> = (lt2 && (cell.status === 'future' || cell.status === 'off'))
          ? { status: lt2 === 'unpaid' ? 'unpaid' : lt2 === 'annual' ? 'annual' : 'special' }
          : {};

        cell = { ...cell, ...leaveOverlay, ...statusOverride, shifts: shiftEntries };
      }

      cells.push(cell);
    }

    const dept = emp.department;
    return {
      id: emp.id,
      code: emp.code,
      fullName: emp.fullName,
      deptName: dept?.name ?? '—',
      deptId: dept?.id,
      shiftName: emp.currentShift?.name,
      cells,
      totalLateMin, totalOtHours,
      lateDays, absentDays, otDays, okDays, annualDays,
    };
  });
}

/** Statuses that count as a completed shift/day */
const WORKED_STATUSES: CellStatus[] = ['ok', 'late', 'early', 'ot'];

function computeSummary(
  rows: EmployeeRow[],
  allSchedules: { employeeId: number }[],
  workingMode: 'FIXED' | 'SHIFT' | undefined,
  year: number,
  month: number,
): MonthlySummary {
  let okShifts = 0;
  let lateTotalEvents = 0; let earlyTotal = 0; let absentTotal = 0; let otTotalHours = 0; let annualTotal = 0;

  for (const r of rows) {
    // Count each individual shift completion:
    // - SHIFT employees may have multiple shifts per day → use cell.shifts[]
    // - FIXED employees have at most 1 shift per day → use cell.status
    // This avoids double-counting days that have both okDays + otDays incremented.
    for (const cell of r.cells) {
      if (cell.shifts && cell.shifts.length > 0) {
        okShifts   += cell.shifts.filter(s => WORKED_STATUSES.includes(s.status)).length;
        earlyTotal += cell.shifts.filter(s => s.status === 'early').length;
      } else {
        if (WORKED_STATUSES.includes(cell.status)) okShifts++;
        if (cell.status === 'early') earlyTotal++;
      }
    }
    lateTotalEvents += r.lateDays;
    absentTotal     += r.absentDays;
    otTotalHours    += r.totalOtHours;
    annualTotal     += r.annualDays;
  }

  let scheduledShifts: number;
  let attendanceRate: number;

  if (workingMode === 'SHIFT') {
    // SHIFT: total per-day schedule records returned by the API.
    // The API is already scoped by departmentId (manager) or all (admin),
    // so the raw count is the correct "Số ca đã phân" for this scope.
    scheduledShifts = allSchedules.length;
    attendanceRate = scheduledShifts > 0 ? okShifts / scheduledShifts * 100 : 0;
  } else {
    // FIXED: scheduled = employees × standard working days in the month
    scheduledShifts = rows.length * countWorkingDays(year, month);
    attendanceRate = scheduledShifts > 0 ? okShifts / scheduledShifts * 100 : 0;
  }

  return { totalEmployees: rows.length, attendanceRate, lateTotalEvents, earlyTotal, absentTotal, otTotalHours, annualTotal, okShifts, scheduledShifts };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** Filter employees by working mode. If omitted, shows all employees. */
  workingMode?: 'FIXED' | 'SHIFT';
  /** Display title shown in the header */
  title?: string;
}

export function AdminAttendanceReport({ workingMode, title }: Props = {}) {
  const { user } = useAuth();
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';
  const isManager   = user?.role === 'manager';
  const isEmployee  = user?.role === 'employee';

  const [year, setYear]   = useState(TODAY.getFullYear());
  const [month, setMonth] = useState(TODAY.getMonth() + 1);

  const [employees, setEmployees]         = useState<Employee[]>([]);
  const [records, setRecords]             = useState<AttendanceRecord[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<ApprovedLeave[]>([]);
  const [departments, setDepartments]     = useState<Department[]>([]);
  const [corrMap, setCorrMap]             = useState<Map<number, CorrectionStatus>>(new Map());
  // Full per-day schedule array — filtered to match filteredRows when computing summary
  const [shiftSchedules, setShiftSchedules] = useState<{ employeeId: number }[]>([]);
  const [loading, setLoading]             = useState(false);

  // Resolved access scope: dept for manager, own id for employee
  const [scopeReady,  setScopeReady]  = useState(false);
  const [scopeDeptId, setScopeDeptId] = useState<number | undefined>();
  const [scopeEmpId,  setScopeEmpId]  = useState<number | undefined>();

  // Filters
  const [search, setSearch]     = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [chipLate,   setChipLate]   = useState(false);
  const [chipEarly,  setChipEarly]  = useState(false);
  const [chipAnnual, setChipAnnual] = useState(false);

  // Views
  const [detailEmpId, setDetailEmpId] = useState<number | null>(null);

  const todayDay = TODAY.getFullYear() === year && TODAY.getMonth() + 1 === month
    ? TODAY.getDate() : -1;

  // ── Resolve access scope ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    if (isAdminOrHr) { setScopeReady(true); return; }
    // manager / employee: fetch own employee profile to get departmentId
    employeeService.get(user.id).then(emp => {
      if (isManager)  setScopeDeptId(emp.departmentId ?? undefined);
      if (isEmployee) { setScopeEmpId(user.id); setDetailEmpId(user.id); }
      setScopeReady(true);
    }).catch(() => setScopeReady(true));
  }, [user]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!scopeReady) return;
    setLoading(true);
    try {
      const dateFrom = isoDateStr(year, month, 1);
      const dateTo   = isoDateStr(year, month, new Date(year, month, 0).getDate());

      const empPromise = scopeEmpId
        // employee: fetch just own record
        ? employeeService.get(scopeEmpId).then(e => ({ data: [e] }))
        : employeeService.list({
            limit: 500, status: 'official', excludeAttendanceExempt: true,
            ...(scopeDeptId ? { departmentId: scopeDeptId } : {}),
          });

      const [empRes, recRes, deptRes, corrRes, shiftRes] = await Promise.allSettled([
        empPromise,
        attendanceService.report({
          dateFrom, dateTo, limit: 2000, page: 1,
          ...(scopeDeptId ? { departmentId: scopeDeptId } : {}),
          ...(scopeEmpId  ? { employeeId:   scopeEmpId  } : {}),
        }),
        organizationService.departments(),
        correctionService.list({ limit: 500 }),
        // Only SHIFT (Command Center) needs per-day schedule count for "Số ca đã phân"
        // Employee role: use /me endpoint (list endpoint is admin/hr/manager only)
        workingMode === 'SHIFT'
          ? (scopeEmpId
              ? shiftScheduleService.listMine(year, month)
              : shiftScheduleService.list({ year, month, ...(scopeDeptId ? { departmentId: scopeDeptId } : {}) }))
          : Promise.resolve([]),
      ]);

      if (empRes.status === 'fulfilled') {
        const emps = empRes.value.data ?? [];
        setEmployees(workingMode ? emps.filter(e => e.workingMode === workingMode) : emps);
      }
      if (recRes.status === 'fulfilled') {
        setRecords(recRes.value.data ?? []);
        setApprovedLeaves(recRes.value.leaveRequests ?? []);
      }
      if (deptRes.status === 'fulfilled') setDepartments(deptRes.value ?? []);
      if (corrRes.status === 'fulfilled') {
        const rawCorr = corrRes.value;
        // Backend returns { data: { items: [], total, page, limit }, ... }
        const corrections: { status: string; attendanceId: number }[] =
          Array.isArray(rawCorr)            ? rawCorr :
          Array.isArray(rawCorr?.data)      ? rawCorr.data :
          Array.isArray(rawCorr?.data?.items) ? rawCorr.data.items : [];
        const map = new Map<number, CorrectionStatus>();
        for (const c of corrections) {
          if (c.status === 'cancelled') continue;
          if (!map.has(c.attendanceId) || c.status === 'pending') {
            map.set(c.attendanceId, c.status as CorrectionStatus);
          }
        }
        setCorrMap(map);
      }
      if (shiftRes.status === 'fulfilled') {
        // Guard: backend returns plain array for this endpoint
        const raw = shiftRes.value;
        const arr: { employeeId: number }[] = Array.isArray(raw)
          ? (raw as { employeeId: number }[])
          : Array.isArray((raw as { data?: unknown }).data)
            ? ((raw as { data: { employeeId: number }[] }).data)
            : [];
        setShiftSchedules(arr);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, scopeReady, scopeDeptId, scopeEmpId]);

  useEffect(() => { load(); }, [load]);

  // ── Build rows ─────────────────────────────────────────────────────────────

  const allRows = useMemo(
    () => buildEmployeeRows(employees, records, year, month, corrMap, approvedLeaves),
    [employees, records, year, month, corrMap, approvedLeaves],
  );

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allRows.filter((row) => {
      if (q && !row.fullName.toLowerCase().includes(q) && !row.code.toLowerCase().includes(q)) return false;
      if (deptFilter && String(row.deptId) !== deptFilter) return false;
      if (chipLate   && row.lateDays  === 0) return false;
      if (chipEarly  && row.cells.filter(c => c.status === 'early').length === 0) return false;
      if (chipAnnual && row.annualDays === 0) return false;
      return true;
    });
  }, [allRows, search, deptFilter, chipLate, chipEarly, chipAnnual]);

  const summary = useMemo(
    () => computeSummary(filteredRows, shiftSchedules, workingMode, year, month),
    [filteredRows, shiftSchedules, workingMode, year, month],
  );

  const detailRow = useMemo(
    () => allRows.find(r => r.id === detailEmpId) ?? null,
    [allRows, detailEmpId],
  );

  // ── Month nav ──────────────────────────────────────────────────────────────

  const changeMonth = (delta: number) => {
    let m = month + delta; let y = year;
    if (m > 12) { m = 1;  y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth(m); setYear(y);
    setDetailEmpId(null);
  };

  // ── Chip toggle ────────────────────────────────────────────────────────────

  const FilterChip = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
        active
          ? 'border-teal-500 bg-teal-50 text-teal-600'
          : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
      }`}>
      {label}
    </button>
  );

  // ── Legend ────────────────────────────────────────────────────────────────

  const legendItems = [
    { icon: '✓', bg: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(44% 0.16 152)', label: 'Đủ giờ'         },
    { icon: '!', bg: 'oklch(58% 0.20 28  / 0.13)', color: 'oklch(58% 0.20 28)',  label: 'Đi trễ'         },
    { icon: '↩', bg: 'oklch(54% 0.13 245 / 0.13)', color: 'oklch(54% 0.13 245)', label: 'Về sớm'         },
    { icon: '?', bg: 'oklch(60% 0.15 75  / 0.18)', color: 'oklch(48% 0.15 75)',  label: 'Chưa checkout'  },
    { icon: 'P', bg: 'oklch(60% 0.15 75  / 0.16)', color: 'oklch(60% 0.15 75)',  label: 'Phép'           },
    { icon: 'L', bg: 'oklch(56% 0.18 330 / 0.13)', color: 'oklch(56% 0.18 330)', label: 'Lễ'             },
    { icon: '✗', bg: 'oklch(52% 0.22 18  / 0.13)', color: 'oklch(52% 0.22 18)',  label: 'Vắng'           },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-3">
        {/* Title — swaps to employee info while viewing a single employee's detail */}
        {detailEmpId && detailRow ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={() => setDetailEmpId(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              ←
            </button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: avatarGradient(detailRow.id) }}>
              {initials(detailRow.fullName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold leading-tight tracking-tight text-gray-900">{detailRow.fullName}</p>
              <p className="truncate text-[11px] text-gray-400">Mã {detailRow.code} · {detailRow.deptName}{detailRow.shiftName ? ` · ${detailRow.shiftName}` : ''}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: 'linear-gradient(140deg, oklch(55% 0.13 200), oklch(46% 0.13 200))' }}>
              CC
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold leading-tight tracking-tight text-gray-900">{title ?? 'Báo cáo chấm công'}</p>
              <p className="text-[11px] text-gray-400">Bảng tổng hợp theo tháng</p>
            </div>
          </div>
        )}

        {/* Right controls — all in one non-wrapping group */}
        <div className="flex shrink-0 items-center gap-2">
          {detailEmpId && detailRow && (
            <button className="h-8 rounded-lg border border-gray-200 bg-gray-50 px-3 text-[12px] font-medium text-gray-600 transition hover:bg-gray-100 whitespace-nowrap">
              In báo cáo
            </button>
          )}

          {/* Month pager + Today */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button onClick={() => changeMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-200">
              ‹
            </button>
            <span className="min-w-[110px] px-2 text-center text-[13px] font-semibold text-gray-800">
              {MONTH_VI[month - 1]} {year}
            </span>
            <button onClick={() => changeMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-200">
              ›
            </button>
          </div>

          <button
            onClick={() => { setYear(TODAY.getFullYear()); setMonth(TODAY.getMonth() + 1); setDetailEmpId(null); }}
            className="h-8 rounded-lg border border-gray-200 bg-gray-50 px-3 text-[12px] font-medium text-gray-600 transition hover:bg-gray-100 whitespace-nowrap">
            Hôm nay
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={async () => {
                if (detailEmpId && detailRow) {
                  try { await exportEmployeeDailyLogExcel(detailRow, year, month); } catch { /* non-critical */ }
                  return;
                }
                const dateFrom = isoDateStr(year, month, 1);
                const dateTo   = isoDateStr(year, month, new Date(year, month, 0).getDate());
                try {
                  if (workingMode === 'SHIFT') {
                    const res = await attendanceService.exportSummary({ dateFrom, dateTo });
                    const url = URL.createObjectURL(res.data);
                    const a = document.createElement('a');
                    a.href = url; a.download = `bao-cao-command-center-${month}-${year}.xlsx`; a.click();
                    URL.revokeObjectURL(url);
                  } else {
                    const res = await attendanceService.exportGrid({ dateFrom, dateTo });
                    const url = URL.createObjectURL(res.data);
                    const a = document.createElement('a');
                    a.href = url; a.download = `bao-cao-ca-co-dinh-${month}-${year}.xlsx`; a.click();
                    URL.revokeObjectURL(url);
                  }
                } catch { /* non-critical */ }
              }}
              className="h-8 rounded-lg px-3 text-[12px] font-semibold text-white transition hover:opacity-90 whitespace-nowrap"
              style={{ background: 'oklch(55% 0.13 200)' }}>
              ↓ Xuất Excel
            </button>
          )}
        </div>
      </div>

      {/* KPI strip — SHIFT shows scheduled/completed shift counts; FIXED shows OT hours + attendance rate */}
      {!detailEmpId && <AdminAttendanceKpiStrip summary={summary} workingMode={workingMode} />}

      {/* Filter row */}
      {!detailEmpId && (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 bg-white px-6 py-2.5">
          {/* Search — hidden for single-employee view */}
          {!isEmployee && (
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tìm</span>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tên hoặc mã NV…"
                className="min-w-[140px] bg-transparent text-[13px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </div>
          )}

          {/* Dept filter — only for admin/hr who can see all depts */}
          {isAdminOrHr && (
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Phòng ban</span>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="min-w-[110px] bg-transparent text-[13px] text-gray-800 outline-none">
                <option value="">Tất cả</option>
                {departments.map(d => (
                  <option key={d.id} value={String(d.id)}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {!isEmployee && (
            <>
              <FilterChip active={chipLate}   onClick={() => setChipLate(p => !p)}   label="Đi trễ" />
              <FilterChip active={chipEarly}  onClick={() => setChipEarly(p => !p)}  label="Về sớm" />
              <FilterChip active={chipAnnual} onClick={() => setChipAnnual(p => !p)} label="Nghỉ có lương" />
            </>
          )}

          {/* Legend */}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {legendItems.map(({ icon, bg, color, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[12px] font-bold"
                  style={{ background: bg, color }}
                >
                  {icon}
                </span>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <PageSpinner />
        ) : detailEmpId && detailRow ? (
          <AdminAttendanceDetailView
            row={detailRow}
            year={year}
            month={month}
            todayDay={todayDay}
            workingMode={workingMode}
            isAdmin={user?.role === 'admin'}
            scheduledShifts={workingMode === 'SHIFT'
              ? shiftSchedules.filter(s => s.employeeId === detailEmpId).length
              : undefined}
            onDeleteRecord={async (id) => {
              await attendanceService.deleteAttendance(id);
              // Remove deleted record from local state so UI updates immediately
              setRecords(prev => prev.filter(r => r.id !== id));
            }}
          />
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-[15px] font-bold tracking-tight text-gray-900">Bảng công toàn công ty</span>
              <span className="text-[12px] text-gray-400">
                {filteredRows.length}/{employees.length} nhân viên
              </span>
            </div>
            {workingMode === 'SHIFT' ? (
              <AdminAttendanceCcGridView
                rows={filteredRows}
                year={year}
                month={month}
                todayDay={todayDay}
                onSelectEmployee={setDetailEmpId}
                shiftSchedules={shiftSchedules}
              />
            ) : (
              <AdminAttendanceGridView
                rows={filteredRows}
                year={year}
                month={month}
                todayDay={todayDay}
                onSelectEmployee={setDetailEmpId}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
