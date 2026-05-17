'use client';

import type { EmployeeShiftSchedule } from '@/types';
import { ScheduleDayCell } from './schedule-day-cell';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Props {
  year: number;
  month: number;
  /** Map from "YYYY-MM-DD" to schedule rows */
  cellsByDate: Map<string, EmployeeShiftSchedule[]>;
  onCellClick: (dateStr: string) => void;
}

/** Build a 42-cell (6×7) array for the month calendar, Sun-first */
function buildCalendarCells(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  const cells: { year: number; month: number; day: number; isCurrentMonth: boolean }[] = [];

  // Trailing days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    cells.push({ year: y, month: m, day: prevMonthDays - i, isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ year, month, day: d, isCurrentMonth: true });
  }

  // Leading days from next month
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    cells.push({ year: y, month: m, day: d, isCurrentMonth: false });
  }

  return cells;
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function ScheduleCalendarGrid({ year, month, cellsByDate, onCellClick }: Props) {
  const cells = buildCalendarCells(year, month);
  const today = toDateStr(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          const dateStr = toDateStr(cell.year, cell.month, cell.day);
          return (
            <ScheduleDayCell
              key={i}
              day={cell.day}
              isCurrentMonth={cell.isCurrentMonth}
              isToday={dateStr === today}
              rows={cellsByDate.get(dateStr) ?? []}
              onClick={() => onCellClick(dateStr)}
            />
          );
        })}
      </div>
    </div>
  );
}
