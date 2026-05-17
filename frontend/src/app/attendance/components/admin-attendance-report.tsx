'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { attendanceService } from '@/services/attendance.service';
import { employeeService } from '@/services/employee.service';
import { organizationService } from '@/services/organization.service';
import { correctionService } from '@/services/attendance-correction.service';
import { PageSpinner } from '@/components/ui/Spinner';
import type { Employee, Department, AttendanceRecord } from '@/types';
import {
  type EmployeeRow, type DayCell, type CellStatus, type MonthlySummary,
  type ShiftEntry, type CorrectionStatus,
  VN_HOLIDAYS, deriveCellStatus, deriveShiftCode, isoDateStr,
} from './admin-attendance-report-types';
import { AdminAttendanceKpiStrip } from './admin-attendance-kpi-strip';
import { AdminAttendanceGridView } from './admin-attendance-grid-view';
import { AdminAttendanceCcGridView } from './admin-attendance-cc-grid-view';
import { AdminAttendanceDetailView } from './admin-attendance-detail-view';

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

function buildEmployeeRows(
  employees: Employee[],
  records: AttendanceRecord[],
  year: number,
  month: number,
  corrMap: Map<number, CorrectionStatus>,
): EmployeeRow[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayMs = TODAY.getTime();

  // Index records: employeeId → dateStr → all records (supports multi-shift per day)
  const recMap = new Map<number, Map<string, AttendanceRecord[]>>();
  for (const r of records) {
    if (!r.date) continue;
    const ds = r.date.split('T')[0]; // YYYY-MM-DD
    if (!recMap.has(r.employeeId)) recMap.set(r.employeeId, new Map());
    const dayMap = recMap.get(r.employeeId)!;
    if (!dayMap.has(ds)) dayMap.set(ds, []);
    dayMap.get(ds)!.push(r);
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
        status = (!isShift && isWeekend) || holidayName ? (holidayName ? 'holiday' : 'off') : 'future';
        cell = { dateStr: ds, day: d, dow, status, holidayName };
      } else if (holidayName) {
        status = 'holiday';
        cell = { dateStr: ds, day: d, dow, status, holidayName, note: holidayName };
      } else if (!isShift && isWeekend) {
        // Fixed-schedule employees: weekend off unless they have a record
        status = rec ? deriveCellStatus(rec) : 'off';
        cell = {
          dateStr: ds, day: d, dow, status,
          checkinTime: fmtT(rec?.checkinTime),
          checkoutTime: fmtT(rec?.checkoutTime),
          otHours: rec?.overtimeHours ? parseFloat(String(rec.overtimeHours)) : 0,
          attendanceId: rec?.id,
        };
      } else if (rec) {
        status = deriveCellStatus(rec);
        // Calculate late/early from timestamps
        let lateMinutes = 0;
        const co = rec.checkoutTime ? new Date(rec.checkoutTime) : null;
        const ci = rec.checkinTime ? new Date(rec.checkinTime) : null;

        if (ci && rec.shift?.startTime) {
          const [sh, sm] = rec.shift.startTime.split(':').map(Number);
          lateMinutes = Math.max(0, ci.getHours() * 60 + ci.getMinutes() - (sh * 60 + sm));
        }
        let earlyMinutes = 0;
        if (co && rec.shift?.endTime) {
          const [eh, em] = rec.shift.endTime.split(':').map(Number);
          earlyMinutes = Math.max(0, eh * 60 + em - (co.getHours() * 60 + co.getMinutes()));
        }

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
        };

        if (status === 'late')   { lateDays++; totalLateMin += lateMinutes; }
        if (status === 'early')  { /* counted separately */ }
        if (status === 'ot')     { otDays++; totalOtHours += otH; }
        else if (otH > 0)        { totalOtHours += otH; otDays++; }
        if (status === 'ok')     okDays++;
        if (status === 'annual') annualDays++;
        if (status === 'absent') absentDays++;
      } else if (isShift) {
        // Shift employee with no record → scheduled rest day
        status = 'off';
        cell = { dateStr: ds, day: d, dow, status };
      } else {
        // Fixed employee on a workday with no record → absent
        status = 'absent';
        absentDays++;
        cell = { dateStr: ds, day: d, dow, status };
      }

      // Build ShiftEntry array from all day records (for CC/SHIFT grid display)
      if (dayRecs.length > 0) {
        const shiftEntries: ShiftEntry[] = dayRecs.map(r => {
          const s = deriveCellStatus(r);
          const ci = r.checkinTime ? new Date(r.checkinTime) : null;
          const co = r.checkoutTime ? new Date(r.checkoutTime) : null;
          let late = 0;
          if (s === 'late' && ci && r.shift?.startTime) {
            const [sh, sm] = r.shift.startTime.split(':').map(Number);
            late = Math.max(0, ci.getHours() * 60 + ci.getMinutes() - (sh * 60 + sm));
          }
          let early = 0;
          if (s === 'early' && co && r.shift?.endTime) {
            const [eh, em] = r.shift.endTime.split(':').map(Number);
            early = Math.max(0, eh * 60 + em - (co.getHours() * 60 + co.getMinutes()));
          }
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
          };
        });
        cell = { ...cell, shifts: shiftEntries };
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

function computeSummary(rows: EmployeeRow[]): MonthlySummary {
  let okShifts = 0; let scheduledShifts = 0;
  let lateTotalEvents = 0; let absentTotal = 0; let otTotalHours = 0; let annualTotal = 0;

  for (const r of rows) {
    okShifts      += r.okDays + r.lateDays + r.cells.filter(c => c.status === 'early').length + r.otDays;
    scheduledShifts += r.cells.filter(c => !['off','holiday','future'].includes(c.status)).length;
    lateTotalEvents += r.lateDays;
    absentTotal   += r.absentDays;
    otTotalHours  += r.totalOtHours;
    annualTotal   += r.annualDays;
  }

  const attendanceRate = scheduledShifts > 0 ? okShifts / scheduledShifts * 100 : 0;
  return { totalEmployees: rows.length, attendanceRate, lateTotalEvents, absentTotal, otTotalHours, annualTotal, okShifts, scheduledShifts };
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

  const [employees, setEmployees]     = useState<Employee[]>([]);
  const [records, setRecords]         = useState<AttendanceRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [corrMap, setCorrMap]         = useState<Map<number, CorrectionStatus>>(new Map());
  const [loading, setLoading]         = useState(false);

  // Resolved access scope: dept for manager, own id for employee
  const [scopeReady,  setScopeReady]  = useState(false);
  const [scopeDeptId, setScopeDeptId] = useState<number | undefined>();
  const [scopeEmpId,  setScopeEmpId]  = useState<number | undefined>();

  // Filters
  const [search, setSearch]     = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [chipLate, setChipLate]     = useState(false);
  const [chipAbsent, setChipAbsent] = useState(false);
  const [chipOT, setChipOT]         = useState(false);

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
            limit: 500, status: 'official',
            ...(scopeDeptId ? { departmentId: scopeDeptId } : {}),
          });

      const [empRes, recRes, deptRes, corrRes] = await Promise.allSettled([
        empPromise,
        attendanceService.report({
          dateFrom, dateTo, limit: 2000, page: 1,
          ...(scopeDeptId ? { departmentId: scopeDeptId } : {}),
          ...(scopeEmpId  ? { employeeId:   scopeEmpId  } : {}),
        }),
        organizationService.departments(),
        correctionService.list({ limit: 500 }),
      ]);

      if (empRes.status === 'fulfilled') {
        const emps = empRes.value.data ?? [];
        setEmployees(workingMode ? emps.filter(e => e.workingMode === workingMode) : emps);
      }
      if (recRes.status === 'fulfilled') setRecords(recRes.value.data ?? []);
      if (deptRes.status === 'fulfilled') setDepartments(deptRes.value ?? []);
      if (corrRes.status === 'fulfilled') {
        const corrections = corrRes.value?.data ?? corrRes.value ?? [];
        const map = new Map<number, CorrectionStatus>();
        for (const c of corrections) {
          if (c.status === 'cancelled') continue;
          if (!map.has(c.attendanceId) || c.status === 'pending') {
            map.set(c.attendanceId, c.status as CorrectionStatus);
          }
        }
        setCorrMap(map);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, scopeReady, scopeDeptId, scopeEmpId]);

  useEffect(() => { load(); }, [load]);

  // ── Build rows ─────────────────────────────────────────────────────────────

  const allRows = useMemo(
    () => buildEmployeeRows(employees, records, year, month, corrMap),
    [employees, records, year, month, corrMap],
  );

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allRows.filter((row) => {
      if (q && !row.fullName.toLowerCase().includes(q) && !row.code.toLowerCase().includes(q)) return false;
      if (deptFilter && String(row.deptId) !== deptFilter) return false;
      if (chipLate   && row.lateDays  === 0) return false;
      if (chipAbsent && row.absentDays === 0) return false;
      if (chipOT     && row.otDays    === 0) return false;
      return true;
    });
  }, [allRows, search, deptFilter, chipLate, chipAbsent, chipOT]);

  const summary = useMemo(() => computeSummary(filteredRows), [filteredRows]);

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
    { icon: '↩', bg: 'oklch(60% 0.15 75  / 0.18)', color: 'oklch(48% 0.15 75)',  label: 'Về sớm'         },
    { icon: '?', bg: 'oklch(60% 0.15 75  / 0.18)', color: 'oklch(48% 0.15 75)',  label: 'Chưa checkout'  },
    { icon: 'P', bg: 'oklch(60% 0.15 75  / 0.16)', color: 'oklch(60% 0.15 75)',  label: 'Phép'           },
    { icon: 'L', bg: 'oklch(56% 0.18 330 / 0.13)', color: 'oklch(56% 0.18 330)', label: 'Lễ'             },
    { icon: '✗', bg: 'oklch(52% 0.22 18  / 0.13)', color: 'oklch(52% 0.22 18)',  label: 'Vắng'           },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: 'linear-gradient(140deg, oklch(55% 0.13 200), oklch(46% 0.13 200))' }}>
            CC
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-tight text-gray-900">{title ?? 'Báo cáo chấm công'}</p>
            <p className="text-[12px] text-gray-400">Bảng tổng hợp theo tháng</p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Month pager */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button onClick={() => changeMonth(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-200">
            ‹
          </button>
          <span className="min-w-[130px] px-3 text-center text-[13px] font-semibold text-gray-800">
            {MONTH_VI[month - 1]} {year}
          </span>
          <button onClick={() => changeMonth(1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-200">
            ›
          </button>
        </div>

        <button onClick={() => { setYear(TODAY.getFullYear()); setMonth(TODAY.getMonth() + 1); setDetailEmpId(null); }}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-100">
          Hôm nay
        </button>

        <button
          onClick={async () => {
            const dateFrom = isoDateStr(year, month, 1);
            const dateTo   = isoDateStr(year, month, new Date(year, month, 0).getDate());
            try {
              const res = await attendanceService.exportGrid({ dateFrom, dateTo });
              const url = URL.createObjectURL(res.data);
              const a = document.createElement('a');
              a.href = url; a.download = `bang-cham-cong-${month}-${year}.xlsx`; a.click();
              URL.revokeObjectURL(url);
            } catch { /* non-critical */ }
          }}
          className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition"
          style={{ background: 'oklch(55% 0.13 200)' }}>
          ↓ Xuất Excel
        </button>
      </div>

      {/* KPI strip */}
      {!detailEmpId && <AdminAttendanceKpiStrip summary={summary} />}

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
              <FilterChip active={chipLate}   onClick={() => setChipLate(p => !p)}   label="Chỉ có đi trễ" />
              <FilterChip active={chipAbsent} onClick={() => setChipAbsent(p => !p)} label="Có vắng mặt" />
              <FilterChip active={chipOT}     onClick={() => setChipOT(p => !p)}     label="Có OT" />
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
            onBack={() => setDetailEmpId(null)}
            workingMode={workingMode}
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
