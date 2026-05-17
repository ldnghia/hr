'use client';

import type { EmployeeShiftSchedule } from '@/types';

interface Props {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  rows: EmployeeShiftSchedule[];
  onClick: () => void;
}

export function ScheduleDayCell({ day, isCurrentMonth, isToday, rows, onClick }: Props) {
  const MAX_CHIPS = 2;
  const visible = rows.slice(0, MAX_CHIPS);
  const overflow = rows.length - MAX_CHIPS;

  return (
    <button
      onClick={onClick}
      className={[
        'min-h-[72px] w-full rounded-lg border p-1.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50',
        isCurrentMonth ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50',
        isToday ? 'border-indigo-400 ring-1 ring-indigo-300' : '',
      ].join(' ')}
    >
      <span className={[
        'mb-1 block text-xs font-semibold leading-none',
        isToday ? 'text-indigo-600' : 'text-gray-500',
      ].join(' ')}>
        {day}
      </span>
      <div className="space-y-0.5">
        {visible.map((r) => (
          <div
            key={r.id}
            className="truncate rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-medium text-indigo-700 leading-tight"
          >
            {r.shift.name}
          </div>
        ))}
        {overflow > 0 && (
          <div className="text-[10px] text-gray-400">+{overflow} thêm</div>
        )}
      </div>
    </button>
  );
}
