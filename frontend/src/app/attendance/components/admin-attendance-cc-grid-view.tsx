'use client';

import { useState } from 'react';
import { type EmployeeRow } from './admin-attendance-report-types';
import { initials, avatarGradient } from './admin-attendance-report-types';
import { CcCell, CcTooltip, CoverageRow, type CcTooltipData } from './admin-attendance-cc-grid-cells';

// ─── Day header ───────────────────────────────────────────────────────────────

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function DayHeader({ day, dow, isToday }: { day: number; dow: number; isToday: boolean }) {
  const isWeekend = dow === 0 || dow === 6;
  return (
    <div className={`flex flex-col items-center py-1.5 ${isToday ? 'relative' : ''}`}
      style={isToday ? { background: 'oklch(55% 0.13 200 / 0.1)' } : undefined}>
      <span className={`text-xs font-bold ${isWeekend ? 'text-red-500' : 'text-gray-800'}`}>{day}</span>
      <span className={`mt-0.5 text-[9px] uppercase tracking-wide ${isWeekend ? 'text-red-400' : 'text-gray-400'}`}>
        {DOW_VI[dow]}
      </span>
      {isToday && (
        <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full"
          style={{ background: 'oklch(55% 0.13 200)' }} />
      )}
    </div>
  );
}

// ─── Coverage computation ─────────────────────────────────────────────────────

type ShiftLetter = 'S' | 'C' | 'D';

function buildCoverage(rows: EmployeeRow[], daysInMonth: number): Record<ShiftLetter, number[]> {
  const counts: Record<ShiftLetter, number[]> = {
    S: Array(daysInMonth).fill(0),
    C: Array(daysInMonth).fill(0),
    D: Array(daysInMonth).fill(0),
  };
  for (const row of rows) {
    for (const cell of row.cells) {
      const shifts = cell.shifts ?? [];
      for (const s of shifts) {
        if ((s.shiftCode === 'S' || s.shiftCode === 'C' || s.shiftCode === 'D') && s.checkinTime) {
          counts[s.shiftCode][cell.day - 1]++;
        }
      }
    }
  }
  return counts;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  rows: EmployeeRow[];
  year: number;
  month: number;
  todayDay: number;
  onSelectEmployee: (empId: number) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminAttendanceCcGridView({ rows, year, month, todayDay, onSelectEmployee }: Props) {
  const [tooltip, setTooltip] = useState<CcTooltipData | null>(null);
  const daysInMonth = new Date(year, month, 0).getDate();

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dow = new Date(year, month - 1, d).getDay();
    return { day: d, dow, isToday: d === todayDay };
  });

  const coverage = buildCoverage(rows, daysInMonth);

  const handleCellEnter = (empName: string) => (e: React.MouseEvent, cell: import('./admin-attendance-report-types').DayCell) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    let x = rect.left + rect.width / 2 - 130;
    x = Math.max(10, Math.min(window.innerWidth - 270, x));
    let y = rect.bottom + 8;
    if (y + 160 > window.innerHeight) y = rect.top - 160;
    setTooltip({ empName, cell, x, y });
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              {/* Sticky left column */}
              <th className="sticky left-0 z-[8] min-w-[220px] max-w-[220px] border-b border-r-2 border-gray-200 bg-gray-50 px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Nhân viên
              </th>
              {/* Day headers */}
              {days.map(({ day, dow, isToday }) => (
                <th
                  key={day}
                  className="sticky top-0 z-[6] min-w-[48px] border-b border-gray-200 bg-gray-50 p-0"
                  style={dow === 6 ? { borderRight: '2px solid #9ca3af' } : { borderRight: '1px solid #e5e7eb' }}
                >
                  <DayHeader day={day} dow={dow} isToday={isToday} />
                </th>
              ))}
              {/* Summary cols */}
              <th className="sticky right-[72px] z-[6] min-w-[72px] border-b border-l border-gray-200 bg-gray-50 px-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-400">Ca</th>
              <th className="sticky right-0      z-[6] min-w-[72px] border-b border-l border-gray-200 bg-gray-50 px-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-400">Ngày công</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const totalShifts = row.cells.reduce((s, c) => s + (c.shifts?.length ?? 0), 0);
              const suffDays = row.okDays + row.otDays;

              return (
                <tr key={row.id} className="group cursor-pointer" onClick={() => onSelectEmployee(row.id)}>
                  {/* Name + Code */}
                  <td className="sticky left-0 z-[5] min-w-[220px] max-w-[220px] border-b border-r-2 border-gray-200 bg-white px-3 py-2 group-hover:bg-gray-50">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ background: avatarGradient(row.id) }}>
                        {initials(row.fullName)}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-gray-900 group-hover:text-teal-600 transition-colors">{row.fullName}</p>
                        <p className="text-[10.5px] text-gray-400 font-mono">{row.code}</p>
                      </div>
                    </div>
                  </td>
                  {/* Day cells */}
                  {row.cells.map((cell, i) => (
                    <CcCell
                      key={cell.dateStr}
                      cell={cell}
                      dow={days[i]?.dow}
                      onMouseEnter={handleCellEnter(row.fullName)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  ))}
                  {/* Summary cols */}
                  <td className="sticky right-[72px] border-b border-l border-gray-200 bg-white px-1.5 text-center font-mono text-[11.5px] font-semibold"
                    style={{ color: totalShifts > 0 ? 'oklch(44% 0.13 245)' : '#aab3c2' }}>
                    {totalShifts > 0 ? totalShifts : '—'}
                  </td>
                  <td className="sticky right-0 border-b border-l border-gray-200 bg-white px-1.5 text-center font-mono text-[13px] font-bold"
                    style={{ color: suffDays > 0 ? 'oklch(44% 0.16 152)' : '#aab3c2' }}>
                    {suffDays > 0 ? suffDays : '—'}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={daysInMonth + 3} className="py-16 text-center text-sm text-gray-400">
                  Không tìm thấy nhân viên phù hợp
                </td>
              </tr>
            )}

            {/* Coverage divider */}
            {rows.length > 0 && (
              <>
                <tr><td colSpan={daysInMonth + 3} className="h-1 bg-gray-100" /></tr>
                <CoverageRow label="Coverage · Sáng" counts={coverage.S} daysInMonth={daysInMonth} year={year} month={month} />
                <CoverageRow label="Coverage · Chiều" counts={coverage.C} daysInMonth={daysInMonth} year={year} month={month} />
                <CoverageRow label="Coverage · Đêm"  counts={coverage.D} daysInMonth={daysInMonth} year={year} month={month} />
              </>
            )}
          </tbody>
        </table>
      </div>
      {tooltip && <CcTooltip data={tooltip} />}
    </div>
  );
}
