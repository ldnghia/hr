'use client';

import { useState, useMemo } from 'react';
import type { ShiftAssignmentRow, ShiftSummary, EmployeeShiftSchedule, DayOff } from '@/types';
import { ScheduleCellEditor } from './schedule-cell-editor';

export const SHIFT_COLORS = [
  { dot: '#F59E0B', bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  { dot: '#10B981', bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
  { dot: '#6366F1', bg: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },
  { dot: '#06B6D4', bg: '#CFFAFE', text: '#164E63', border: '#A5F3FC' },
  { dot: '#F43F5E', bg: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
];

const OFF_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  OFF: { bg: '#F4F4F5', color: '#71717A', label: 'OFF'  },
  AL:  { bg: '#FFEDD5', color: '#9A3412', label: 'Phép' },
  SL:  { bg: '#FCE7F3', color: '#9D174D', label: 'Ốm'  },
  H:   { bg: '#FEE2E2', color: '#991B1B', label: 'Lễ'  },
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface Props {
  weekDays: Date[];
  rows: ShiftAssignmentRow[];
  shifts: ShiftSummary[];
  cellsByEmpDate: Map<number, Map<string, EmployeeShiftSchedule[]>>;
  dayOffsByEmpDate: Map<number, Map<string, DayOff>>;
  onAddShift: (empId: number, dateStr: string, shiftId: number) => Promise<void>;
  onRemoveShift: (scheduleId: number) => Promise<void>;
  onSetOff: (empId: number, dateStr: string, offType: string) => Promise<void>;
  onRemoveOff: (offId: number) => Promise<void>;
}

export function ScheduleStaffView({
  weekDays, rows, shifts, cellsByEmpDate, dayOffsByEmpDate,
  onAddShift, onRemoveShift, onSetOff, onRemoveOff,
}: Props) {
  const [editing, setEditing] = useState<{ empId: number; dateStr: string } | null>(null);
  const today = toDateStr(new Date());

  // Pre-compute color map keyed by shiftId (consistent across cell pills and editor)
  const shiftColorMap = useMemo(() =>
    new Map(shifts.map((s, i) => [s.id, SHIFT_COLORS[i % SHIFT_COLORS.length]])),
  [shifts]);

  // Group employees by department
  const groups = useMemo(() => {
    const map = new Map<string, ShiftAssignmentRow[]>();
    for (const r of rows) {
      const key = r.employee.department?.name ?? 'Chưa phân phòng';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  // Coverage: count employees per shift per day
  const coverage = useMemo(() => {
    return weekDays.map((d) => {
      const ds = toDateStr(d);
      const counts: Record<number, number> = {};
      for (const r of rows) {
        for (const s of (cellsByEmpDate.get(r.employee.id)?.get(ds) ?? [])) {
          counts[s.shiftId] = (counts[s.shiftId] ?? 0) + 1;
        }
      }
      return counts;
    });
  }, [weekDays, rows, cellsByEmpDate]);

  async function handleToggleShift(empId: number, dateStr: string, shiftId: number) {
    const existing = cellsByEmpDate.get(empId)?.get(dateStr) ?? [];
    const found = existing.find(s => s.shiftId === shiftId);
    if (found) await onRemoveShift(found.id);
    else await onAddShift(empId, dateStr, shiftId);
  }

  async function handleSetOff(empId: number, dateStr: string, code: string) {
    const existing = dayOffsByEmpDate.get(empId)?.get(dateStr);
    if (existing?.offType === code) await onRemoveOff(existing.id);
    else await onSetOff(empId, dateStr, code);
  }

  async function handleClear(empId: number, dateStr: string) {
    const schedules = cellsByEmpDate.get(empId)?.get(dateStr) ?? [];
    for (const s of schedules) await onRemoveShift(s.id);
    const dayOff = dayOffsByEmpDate.get(empId)?.get(dateStr);
    if (dayOff) await onRemoveOff(dayOff.id);
    setEditing(null);
  }

  const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="sticky left-0 z-10 bg-gray-50 w-44 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-r border-gray-200">
              Nhân viên
            </th>
            {weekDays.map((d, i) => {
              const ds = toDateStr(d);
              const isToday = ds === today;
              const isWeekend = i >= 5;
              return (
                <th key={i} className={['px-2 py-2 text-left text-[11px] font-semibold border-r border-gray-200 last:border-r-0', isToday ? 'bg-indigo-50 text-indigo-600' : isWeekend ? 'text-gray-400' : 'text-gray-500'].join(' ')}>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className={['font-semibold', isToday ? 'text-indigo-600' : ''].join(' ')}>{WEEKDAYS[i]}</span>
                    <span className="font-normal tabular-nums text-[10px] text-gray-400">{d.getDate()}/{d.getMonth()+1}</span>
                  </div>
                </th>
              );
            })}
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-l border-gray-200 w-16">
              Giờ/tuần
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from(groups.entries()).map(([dept, members]) => (
            <>
              {/* Department header row */}
              <tr key={`dept-${dept}`} className="border-y border-gray-100 bg-gray-50/70">
                <td colSpan={weekDays.length + 2} className="px-4 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{dept}</span>
                  <span className="ml-1.5 text-[11px] text-gray-400">· {members.length} người</span>
                </td>
              </tr>
              {members.map((r) => {
                const empId = r.employee.id;
                // Count working shifts for weekly hours
                let totalShifts = 0;
                for (const d of weekDays) {
                  totalShifts += (cellsByEmpDate.get(empId)?.get(toDateStr(d)) ?? []).length;
                }
                const weeklyHours = totalShifts * 8;

                return (
                  <tr key={empId} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    {/* Sticky employee column */}
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r border-gray-100">
                      <div className="text-xs font-semibold text-gray-800 truncate max-w-[150px]">{r.employee.fullName}</div>
                      <div className="text-[10px] text-gray-400 tabular-nums mt-0.5">{r.employee.code}</div>
                    </td>

                    {/* Day cells */}
                    {weekDays.map((d, di) => {
                      const ds = toDateStr(d);
                      const isEditing = editing?.empId === empId && editing?.dateStr === ds;
                      const isToday = ds === today;
                      const isWeekend = di >= 5;
                      const schedules = cellsByEmpDate.get(empId)?.get(ds) ?? [];
                      const dayOff = dayOffsByEmpDate.get(empId)?.get(ds);

                      return (
                        <td
                          key={di}
                          className={['relative border-r border-gray-100 last:border-r-0 cursor-pointer p-1.5 align-middle h-11 transition-colors', isEditing ? 'z-50' : '', isToday ? 'bg-indigo-50/20' : isWeekend ? 'bg-gray-50/50' : '', 'hover:bg-indigo-50/30'].join(' ')}
                          onClick={() => setEditing(isEditing ? null : { empId, dateStr: ds })}
                        >
                          {/* Cell content */}
                          {dayOff ? (
                            <span
                              className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-semibold w-full"
                              style={{ background: OFF_BADGE[dayOff.offType].bg, color: OFF_BADGE[dayOff.offType].color }}
                            >
                              {OFF_BADGE[dayOff.offType].label}
                            </span>
                          ) : schedules.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {schedules.map((s) => {
                                const colors = shiftColorMap.get(s.shiftId) ?? SHIFT_COLORS[0];
                                return (
                                  <span
                                    key={s.id}
                                    className="inline-flex items-center gap-1 rounded-[4px] border px-1 py-0.5 text-[10px] font-semibold leading-tight"
                                    style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: colors.dot }} />
                                    {s.shift.name.slice(0, 3)}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[13px] text-gray-200 select-none">—</span>
                          )}

                          {/* Inline cell editor popover */}
                          {isEditing && (
                            <ScheduleCellEditor
                              shifts={r.employee.workingMode === 'SHIFT' ? shifts.filter(s => !s.isDefault) : shifts}
                              shiftColorMap={shiftColorMap}
                              activeShiftIds={schedules.map(s => s.shiftId)}
                              activeOffType={dayOff?.offType ?? null}
                              alignRight={di >= 5}
                              onToggleShift={(sid) => handleToggleShift(empId, ds, sid)}
                              onSetOff={(code) => handleSetOff(empId, ds, code)}
                              onClear={() => handleClear(empId, ds)}
                              onClose={() => setEditing(null)}
                            />
                          )}
                        </td>
                      );
                    })}

                    {/* Weekly hours summary */}
                    <td className="border-l border-gray-100 text-center px-2 py-2">
                      <span className="text-sm font-semibold text-gray-800 tabular-nums">{weeklyHours}</span>
                      <span className="text-[11px] text-gray-400 ml-0.5">h</span>
                    </td>
                  </tr>
                );
              })}
            </>
          ))}

          {/* Coverage summary row */}
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 border-r border-gray-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Coverage</span>
            </td>
            {weekDays.map((d, di) => {
              const counts = coverage[di];
              return (
                <td key={di} className="border-r border-gray-200 last:border-r-0 px-2 py-2">
                  <div className="flex flex-wrap gap-2 justify-center">
                    {shifts.map((s) => {
                      const n = counts[s.id] ?? 0;
                      const colors = shiftColorMap.get(s.id) ?? SHIFT_COLORS[0];
                      return (
                        <div key={s.id} className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.dot }} />
                          <span className={['text-[11px] font-medium tabular-nums', n < 3 ? 'text-red-600 font-bold' : 'text-gray-700'].join(' ')}>
                            {n}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </td>
              );
            })}
            <td className="border-l border-gray-200 text-center px-2 py-2">
              <div className="text-[10px] text-gray-400">min</div>
              <div className="text-xs font-semibold text-gray-600">3/ca</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
