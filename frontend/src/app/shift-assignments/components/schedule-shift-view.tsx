'use client';

import { useMemo } from 'react';
import type { ShiftAssignmentRow, ShiftSummary, EmployeeShiftSchedule } from '@/types';
import { SHIFT_COLORS } from './schedule-staff-view';

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.slice(-2).map(p => p[0]).join('').toUpperCase();
}

function staffHue(id: number) {
  return (id * 137) % 360;
}

interface Props {
  weekDays: Date[];
  rows: ShiftAssignmentRow[];
  shifts: ShiftSummary[];
  cellsByEmpDate: Map<number, Map<string, EmployeeShiftSchedule[]>>;
}

export function ScheduleShiftView({ weekDays, rows, shifts, cellsByEmpDate }: Props) {
  const today = toDateStr(new Date());
  const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  // Precompute: for each shift × day → list of employees assigned to that shift
  const staffByShiftDay = useMemo(() => {
    const result = new Map<number, Map<string, ShiftAssignmentRow[]>>();
    for (const shift of shifts) {
      const byDate = new Map<string, ShiftAssignmentRow[]>();
      for (const d of weekDays) {
        const ds = toDateStr(d);
        const working = rows.filter(r =>
          (cellsByEmpDate.get(r.employee.id)?.get(ds) ?? []).some(s => s.shiftId === shift.id)
        );
        byDate.set(ds, working);
      }
      result.set(shift.id, byDate);
    }
    return result;
  }, [shifts, weekDays, rows, cellsByEmpDate]);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="w-40 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-r border-gray-200">
              Ca
            </th>
            {weekDays.map((d, i) => {
              const ds = toDateStr(d);
              const isToday = ds === today;
              const isWeekend = i >= 5;
              return (
                <th key={i} className={['px-3 py-2 text-left text-[11px] font-semibold border-r border-gray-200 last:border-r-0', isToday ? 'bg-indigo-50 text-indigo-600' : isWeekend ? 'text-gray-400' : 'text-gray-500'].join(' ')}>
                  <div className="flex items-baseline justify-between gap-1">
                    <span>{WEEKDAYS[i]}</span>
                    <span className="font-normal tabular-nums text-[10px] text-gray-400">{d.getDate()}/{d.getMonth()+1}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift, si) => {
            const colors = SHIFT_COLORS[si % SHIFT_COLORS.length];
            return (
              <tr key={shift.id} className="border-b border-gray-100 last:border-b-0">
                {/* Shift info column */}
                <td className="px-4 py-3 border-r border-gray-200 align-top">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors.dot }} />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{shift.name}</div>
                      <div className="text-[11px] text-gray-400 tabular-nums mt-0.5">
                        {shift.startTime.slice(0,5)} – {shift.endTime.slice(0,5)}
                      </div>
                    </div>
                  </div>
                </td>

                {weekDays.map((d, di) => {
                  const ds = toDateStr(d);
                  const isToday = ds === today;
                  const isWeekend = di >= 5;
                  const assigned = staffByShiftDay.get(shift.id)?.get(ds) ?? [];
                  const low = assigned.length < 3;

                  return (
                    <td
                      key={di}
                      className={[
                        'border-r border-gray-100 last:border-r-0 px-2 py-2 align-top',
                        isToday ? 'bg-indigo-50/20' : isWeekend ? 'bg-gray-50/50' : '',
                      ].join(' ')}
                    >
                      {/* Count badge */}
                      <div className="mb-1.5">
                        <span className={['inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold', low ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'].join(' ')}>
                          <span className="tabular-nums font-bold">{assigned.length}</span> Nhân viên
                        </span>
                      </div>

                      {/* Employee chips */}
                      <div className="flex flex-wrap gap-1">
                        {assigned.map(r => {
                          const hue = staffHue(r.employee.id);
                          return (
                            <span
                              key={r.employee.id}
                              className="inline-flex items-center gap-1 rounded-full border border-gray-200 pr-1.5 text-[11px] text-gray-700"
                              style={{
                                borderColor: `hsl(${hue} 50% 80%)`,
                                background: `hsl(${hue} 60% 97%)`,
                                color: `hsl(${hue} 50% 30%)`,
                              }}
                            >
                              <span
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold flex-shrink-0"
                                style={{ background: `hsl(${hue} 60% 88%)`, color: `hsl(${hue} 55% 28%)` }}
                              >
                                {initials(r.employee.fullName ?? '')}
                              </span>
                              <span className="max-w-[70px] truncate">
                                {(r.employee.fullName ?? '').split(' ').slice(-1)[0]}
                              </span>
                            </span>
                          );
                        })}
                        {assigned.length === 0 && (
                          <span className="text-[11px] italic text-gray-300">— chưa có ai —</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
