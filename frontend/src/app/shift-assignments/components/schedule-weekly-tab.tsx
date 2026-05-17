'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { EmployeeShiftSchedule, ShiftAssignmentRow, ShiftSummary, DayOff } from '@/types';
import { shiftScheduleService } from '@/services/shift-schedule.service';
import { ScheduleStaffView, SHIFT_COLORS } from './schedule-staff-view';
import { ScheduleShiftView } from './schedule-shift-view';

const OFF_LABELS: Record<string, string> = {
  OFF: 'Nghỉ full ngày',
  AL:  'Nghỉ phép năm',
  SL:  'Nghỉ ốm',
  H:   'Nghỉ lễ',
};

const OFF_CHIP: Record<string, string> = {
  OFF: 'bg-gray-100 text-gray-600',
  AL:  'bg-orange-50 text-orange-700',
  SL:  'bg-pink-50 text-pink-700',
  H:   'bg-red-50 text-red-700',
};

interface Props {
  rows: ShiftAssignmentRow[];
  shifts: ShiftSummary[];
  isManager: boolean;
  departmentId?: number;
  onDepartmentChange?: (id: number | undefined) => void;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

export function ScheduleWeeklyTab({ rows, shifts, isManager, departmentId, onDepartmentChange }: Props) {
  const [weekStart, setWeekStart]   = useState<Date>(() => getWeekStart(new Date()));
  const [schedules, setSchedules]   = useState<EmployeeShiftSchedule[]>([]);
  const [dayOffs, setDayOffs]       = useState<DayOff[]>([]);
  const [loading, setLoading]       = useState(false);
  const [view, setView]             = useState<'staff' | 'shift'>('staff');

  const weekDays = getWeekDays(weekStart);
  const dateFrom = toDateStr(weekDays[0]);
  const dateTo   = toDateStr(weekDays[6]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sched, offs] = await Promise.all([
        shiftScheduleService.listRange({ dateFrom, dateTo, departmentId }),
        shiftScheduleService.listDayOffs({ dateFrom, dateTo, departmentId }),
      ]);
      setSchedules(sched);
      setDayOffs(offs);
    } catch {
      // non-critical: keep stale data visible
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, departmentId]);

  useEffect(() => { load(); }, [load]);

  // Map<empId, Map<dateStr, schedule[]>>
  const cellsByEmpDate = useMemo(() => {
    const map = new Map<number, Map<string, EmployeeShiftSchedule[]>>();
    for (const s of schedules) {
      if (!map.has(s.employeeId)) map.set(s.employeeId, new Map());
      const ds = s.date.slice(0, 10);
      const inner = map.get(s.employeeId)!;
      if (!inner.has(ds)) inner.set(ds, []);
      inner.get(ds)!.push(s);
    }
    return map;
  }, [schedules]);

  // Map<empId, Map<dateStr, DayOff>>
  const dayOffsByEmpDate = useMemo(() => {
    const map = new Map<number, Map<string, DayOff>>();
    for (const o of dayOffs) {
      if (!map.has(o.employeeId)) map.set(o.employeeId, new Map());
      map.get(o.employeeId)!.set(o.date.slice(0, 10), o);
    }
    return map;
  }, [dayOffs]);

  const totalShifts  = schedules.length;
  const totalDayOffs = dayOffs.length;

  const departments = useMemo(() =>
    Array.from(
      new Map(
        rows
          .filter(r => r.employee.department)
          .map(r => [r.employee.department!.id, r.employee.department!.name]),
      ).entries(),
    ),
  [rows]);

  function navigate(delta: number) {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  }

  async function handleAddShift(empId: number, dateStr: string, shiftId: number) {
    try {
      const r = await shiftScheduleService.assignDay({ employeeId: empId, shiftId, date: dateStr });
      setSchedules(prev => [
        ...prev.filter(s => !(s.employeeId === empId && s.date.slice(0,10) === dateStr && s.shiftId === shiftId)),
        r,
      ]);
    } catch { await load(); }
  }

  async function handleRemoveShift(id: number) {
    try {
      await shiftScheduleService.removeOne(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch { await load(); }
  }

  async function handleSetOff(empId: number, dateStr: string, offType: string) {
    try {
      const r = await shiftScheduleService.assignDayOff({ employeeId: empId, date: dateStr, offType });
      setDayOffs(prev => [
        ...prev.filter(o => !(o.employeeId === empId && o.date.slice(0,10) === dateStr)),
        r,
      ]);
    } catch { await load(); }
  }

  async function handleRemoveOff(id: number) {
    try {
      await shiftScheduleService.removeDayOff(id);
      setDayOffs(prev => prev.filter(o => o.id !== id));
    } catch { await load(); }
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-white px-4 py-2 mb-4">
        {/* Week navigator */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1">
          <button
            onClick={() => navigate(-1)}
            className="rounded p-1 hover:bg-gray-100 text-gray-500"
            aria-label="Previous week"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="px-2 text-sm font-medium text-gray-700 min-w-[150px] text-center tabular-nums">
            {fmtDate(weekDays[0])} – {fmtDate(weekDays[6])}/{weekDays[6].getFullYear()}
          </span>
          <button
            onClick={() => navigate(1)}
            className="rounded p-1 hover:bg-gray-100 text-gray-500"
            aria-label="Next week"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => setWeekStart(getWeekStart(new Date()))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Tuần này
        </button>

        {/* Department filter (admin/hr only) */}
        {!isManager && onDepartmentChange && departments.length > 0 && (
          <select
            value={departmentId ?? ''}
            onChange={e => onDepartmentChange(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

        {loading && <span className="text-xs text-gray-400 ml-1">Đang tải...</span>}

        {/* View toggle: staff vs shift — right side */}
        <div className="ml-auto flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
          {(['staff', 'shift'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {v === 'staff' ? 'Theo nhân viên' : 'Theo ca'}
            </button>
          ))}
        </div>

        {/* Stats + Legend */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 text-right pr-2 border-r border-gray-200">
            <div>
              <span className="text-sm font-bold tabular-nums text-gray-900">{rows.length}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-400 ml-1">NV</span>
            </div>
            <div>
              <span className="text-sm font-bold tabular-nums text-gray-900">{totalShifts}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-400 ml-1">ca làm</span>
            </div>
            <div>
              <span className="text-sm font-bold tabular-nums text-gray-900">{totalDayOffs}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-400 ml-1">ngày nghỉ</span>
            </div>
          </div>
          {shifts.slice(0, 5).map((s, i) => {
            const c = SHIFT_COLORS[i % SHIFT_COLORS.length];
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
                <span className="text-[11px] text-gray-500">
                  <b className="text-gray-700">{s.name}</b>{' '}
                  {s.startTime.slice(0,5)}–{s.endTime.slice(0,5)}
                </span>
              </div>
            );
          })}
          <div className="h-4 w-px bg-gray-200" />
          {Object.entries(OFF_LABELS).map(([code, label]) => (
            <div key={code} className="flex items-center gap-1.5">
              <span className={[
                'inline-flex items-center justify-center rounded px-1.5 py-0 text-[10px] font-bold h-4',
                OFF_CHIP[code],
              ].join(' ')}>
                {code}
              </span>
              <span className="text-[11px] text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── View content ── */}
      {view === 'staff' ? (
        <ScheduleStaffView
          weekDays={weekDays}
          rows={rows}
          shifts={shifts}
          cellsByEmpDate={cellsByEmpDate}
          dayOffsByEmpDate={dayOffsByEmpDate}
          onAddShift={handleAddShift}
          onRemoveShift={handleRemoveShift}
          onSetOff={handleSetOff}
          onRemoveOff={handleRemoveOff}
        />
      ) : (
        <ScheduleShiftView
          weekDays={weekDays}
          rows={rows}
          shifts={shifts}
          cellsByEmpDate={cellsByEmpDate}
        />
      )}
    </div>
  );
}
