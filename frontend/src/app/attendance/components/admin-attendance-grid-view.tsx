'use client';

import { useRef, useState } from 'react';
import {
  type EmployeeRow, type DayCell, type CellStatus,
  STATUS_META, initials, avatarGradient,
} from './admin-attendance-report-types';

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: 'Phép năm',
  sick: 'Phép ốm',
  compensatory: 'Phép bù',
  unpaid: 'Không lương',
};

// ─── Cell colour tokens (Tailwind arbitrary + inline style) ──────────────────

const CELL_STYLE: Record<CellStatus, { bg: string; color: string }> = {
  ok:      { bg: 'oklch(54% 0.16 152 / 0.13)', color: 'oklch(54% 0.16 152)' },
  late:    { bg: 'oklch(58% 0.20 28  / 0.13)', color: 'oklch(58% 0.20 28)'  },
  early:   { bg: 'oklch(54% 0.13 245 / 0.13)', color: 'oklch(54% 0.13 245)' },
  annual:  { bg: 'oklch(60% 0.15 75  / 0.16)', color: 'oklch(60% 0.15 75)'  },
  unpaid:  { bg: 'oklch(50% 0.10 60  / 0.14)', color: 'oklch(50% 0.10 60)'  },
  special: { bg: 'oklch(54% 0.16 290 / 0.13)', color: 'oklch(54% 0.16 290)' },
  holiday: { bg: 'oklch(56% 0.18 330 / 0.13)', color: 'oklch(56% 0.18 330)' },
  ot:      { bg: 'oklch(60% 0.17 45  / 0.15)', color: 'oklch(60% 0.17 45)'  },
  absent:  { bg: 'oklch(52% 0.22 18  / 0.13)', color: 'oklch(52% 0.22 18)'  },
  off:     { bg: 'transparent',                 color: '#aab3c2'              },
  future:  { bg: 'transparent',                 color: '#aab3c2'              },
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipData {
  empName: string;
  cell: DayCell;
  x: number;
  y: number;
}

function Tooltip({ data }: { data: TooltipData }) {
  const { empName, cell } = data;
  const meta = STATUS_META[cell.status];
  const cs = CELL_STYLE[cell.status];

  return (
    <div
      className="pointer-events-none fixed z-[200] max-w-[260px] rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs shadow-xl"
      style={{ left: data.x, top: data.y }}
    >
      <p className="mb-1.5 font-semibold text-gray-900">
        {empName} <span className="font-normal text-gray-400">· Ngày {String(cell.day).padStart(2, '0')}</span>
      </p>
      {/* time row */}
      {cell.checkinTime && (
        <p className="mt-1 text-gray-500">
          <span className="text-gray-400 mr-1">Vào/Ra</span>
          <span className="font-mono text-gray-800">{cell.checkinTime} → {cell.checkoutTime ?? '—'}</span>
        </p>
      )}
      {/* working hours + sufficient indicator */}
      {cell.checkinTime && (
        <p className="mt-0.5 text-gray-500">
          <span className="text-gray-400 mr-1">Giờ làm</span>
          <span className="font-semibold text-gray-800">
            {(cell.workingHours ?? 0) > 0 ? `${Number(cell.workingHours).toFixed(2)}h` : '—'}
          </span>
          {(cell.normalHours ?? 0) > 0 && (() => {
            const sufficient = !cell.hasNoCheckout && (cell.workingHours ?? 0) >= (cell.normalHours ?? 0);
            return sufficient
              ? <span className="ml-1.5 text-[10px] font-semibold" style={{ color: 'oklch(54% 0.16 152)' }}>✓ Đủ giờ</span>
              : <span className="ml-1.5 text-[10px] font-semibold" style={{ color: 'oklch(58% 0.20 28)' }}>✗ Thiếu giờ</span>;
          })()}
        </p>
      )}
      {/* secondary status badges */}
      {(() => {
        const flags: { label: string; bg: string; color: string }[] = [];
        if ((cell.lateMinutes ?? 0) > 0)
          flags.push({ label: 'Đi muộn',      bg: 'oklch(58% 0.20 28 / 0.15)',  color: 'oklch(44% 0.20 28)'  });
        if ((cell.earlyMinutes ?? 0) > 0)
          flags.push({ label: 'Về sớm',        bg: 'oklch(54% 0.13 245 / 0.15)', color: 'oklch(40% 0.13 245)' });
        if (cell.isCorrected || cell.correctionStatus === 'approved')
          flags.push({ label: 'Đã điều chỉnh', bg: 'oklch(71% 0.10 295 / 0.18)', color: 'oklch(42% 0.14 295)' });
        if (cell.isInOffice === true)
          flags.push({ label: 'Trong VP',      bg: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(40% 0.16 152)' });
        if (flags.length === 0) return null;
        return (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {flags.map(({ label, bg, color }) => (
              <span key={label}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: bg, color }}>
                {label}
              </span>
            ))}
          </div>
        );
      })()}
      {/* other flags */}
      <div className="mt-1 flex flex-col gap-0.5">
        {cell.hasNoCheckout && (
          <p className="text-gray-500"><span className="text-gray-400 mr-1">⚠</span>
            <span style={{ color: 'oklch(58% 0.18 50)' }}>Chưa checkout</span></p>
        )}
        {(cell.otHours ?? 0) > 0 && (
          <p className="text-gray-500"><span className="text-gray-400 mr-1">Tăng ca</span>
            <span style={{ color: CELL_STYLE.ot.color }}>+{cell.otHours}h</span></p>
        )}
      </div>
      {cell.holidayName && (
        <p className="mt-0.5 text-gray-500"><span className="text-gray-400 mr-1">Lễ</span>{cell.holidayName}</p>
      )}
      {cell.leaveType && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: 'oklch(60% 0.15 75 / 0.18)', color: 'oklch(40% 0.15 75)' }}>
            {LEAVE_TYPE_LABEL[cell.leaveType] ?? cell.leaveType}
          </span>
          {cell.isHalfDay && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: 'oklch(60% 0.15 75 / 0.10)', color: 'oklch(40% 0.15 75)' }}>
              Nửa ngày (0.5)
            </span>
          )}
        </div>
      )}
      {cell.correctionStatus === 'pending' && (
        <p className="mt-1 text-[10px] font-semibold" style={{ color: 'oklch(55% 0.18 50)' }}>● Có yêu cầu chỉnh sửa</p>
      )}
      {cell.correctionStatus === 'rejected' && (
        <p className="mt-1 text-[10px] font-semibold" style={{ color: 'oklch(42% 0.22 18)' }}>✗ Yêu cầu bị từ chối</p>
      )}
    </div>
  );
}

// ─── Day header ───────────────────────────────────────────────────────────────

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface DayHead { day: number; dow: number; isToday: boolean }

function DayHeader({ day, dow, isToday }: DayHead) {
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

// ─── Grid cell ────────────────────────────────────────────────────────────────

const SUFFICIENT_BG    = 'oklch(54% 0.16 152 / 0.15)';
const SUFFICIENT_COLOR = 'oklch(44% 0.16 152)';
const INCOMPLETE_BG    = 'oklch(60% 0.15 75  / 0.18)';
const INCOMPLETE_COLOR = 'oklch(48% 0.15 75)';

function Cell({ cell, onMouseEnter, onMouseLeave }: {
  cell: DayCell;
  onMouseEnter: (e: React.MouseEvent, c: DayCell) => void;
  onMouseLeave: () => void;
}) {
  const cs  = CELL_STYLE[cell.status];
  const isSun = cell.dow === 0 || cell.dow === 6;

  const hasAttended  = !!cell.checkinTime;
  const isSufficient = hasAttended && !cell.hasNoCheckout &&
    ((cell.normalHours ?? 0) > 0 ? (cell.workingHours ?? 0) >= (cell.normalHours ?? 0) : cell.status === 'ok' || cell.status === 'ot');

  // Colour priority matches glyph priority: Đủ giờ → Đi trễ → Về sớm → Chưa checkout → status
  const bg = isSufficient             ? SUFFICIENT_BG
    : cell.status === 'late'          ? CELL_STYLE.late.bg
    : cell.status === 'early'         ? CELL_STYLE.early.bg
    : cell.hasNoCheckout              ? INCOMPLETE_BG
    : cs.bg;
  const color = isSufficient          ? SUFFICIENT_COLOR
    : cell.status === 'late'          ? CELL_STYLE.late.color
    : cell.status === 'early'         ? CELL_STYLE.early.color
    : cell.hasNoCheckout              ? INCOMPLETE_COLOR
    : cs.color;

  // Priority: Đủ giờ → Đi trễ → Về sớm → Chưa checkout → Vắng
  let glyph: React.ReactNode;
  if (isSufficient) {
    glyph = <span className="text-[15px] leading-none font-bold">✓</span>;
  } else if (cell.status === 'late') {
    glyph = <span>!</span>;
  } else if (cell.status === 'early') {
    glyph = <span className="text-[12px]">↩</span>;
  } else if (cell.hasNoCheckout) {
    glyph = <span className="text-[12px] font-bold">?</span>;
  } else if (cell.status === 'absent') {
    glyph = <span>✗</span>;
  } else if (cell.status === 'annual') {
    glyph = cell.isHalfDay
      ? <span className="relative">P<sup className="text-[7px] leading-none">½</sup></span>
      : <span>P</span>;
  } else if (cell.status === 'unpaid') {
    glyph = cell.isHalfDay
      ? <span className="relative">KL<sup className="text-[7px] leading-none">½</sup></span>
      : <span>KL</span>;
  } else if (cell.status === 'special') {
    glyph = cell.isHalfDay
      ? <span className="relative">ĐB<sup className="text-[7px] leading-none">½</sup></span>
      : <span>ĐB</span>;
  } else if (cell.status === 'holiday') {
    glyph = <span>L</span>;
  } else {
    glyph = <span style={{ opacity: 0.4 }}>·</span>;
  }

  return (
    <td
      className={`day-cell w-9 min-w-[36px] p-0.5 ${isSun ? 'bg-gray-50/60' : ''}`}
      onMouseEnter={(e) => onMouseEnter(e, cell)}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="relative flex h-[30px] w-full items-center justify-center rounded font-mono text-[10px] font-semibold"
        style={{ background: bg, color }}
      >
        {glyph}
        {/* Half-day leave badge: shown when employee worked but also has half-day leave */}
        {cell.isHalfDay && cell.checkinTime && (
          <span className="absolute bottom-[1px] left-[2px] text-[7px] font-bold leading-none"
            style={{ color: 'oklch(48% 0.15 75)' }}>½P</span>
        )}
        {(cell.correctionStatus || cell.isCorrected) && (
          <span className="absolute top-[2px] right-[2px] h-1.5 w-1.5 rounded-full shadow-[0_0_0_1px_white]"
            style={{ background: 'oklch(58% 0.16 295)' }} />
        )}
      </div>
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  rows: EmployeeRow[];
  year: number;
  month: number;
  todayDay: number;
  onSelectEmployee: (empId: number) => void;
}

export function AdminAttendanceGridView({ rows, year, month, todayDay, onSelectEmployee }: Props) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const daysInMonth = new Date(year, month, 0).getDate();

  const handleCellEnter = (empName: string) => (e: React.MouseEvent, cell: DayCell) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    let x = rect.left + rect.width / 2 - 130;
    x = Math.max(10, Math.min(window.innerWidth - 270, x));
    let y = rect.bottom + 8;
    if (y + 140 > window.innerHeight) y = rect.top - 140;
    setTooltip({ empName, cell, x, y });
  };

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dow = new Date(year, month - 1, d).getDay();
    return { day: d, dow, isToday: d === todayDay };
  });

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
                <th key={day}
                  className="sticky top-0 z-[6] min-w-[36px] border-b border-r border-gray-100 bg-gray-50 p-0">
                  <DayHeader day={day} dow={dow} isToday={isToday} />
                </th>
              ))}
              {/* Summary col */}
              <th className="sticky right-0 z-[6] min-w-[72px] border-b border-l border-gray-100 bg-gray-50 px-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Ngày công
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group cursor-pointer"
                onClick={() => onSelectEmployee(row.id)}
              >
                {/* Name + Code */}
                <td className="sticky left-0 z-[5] min-w-[220px] max-w-[220px] border-b border-r-2 border-gray-200 bg-white px-3 py-2 group-hover:bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ background: avatarGradient(row.id) }}>
                      {initials(row.fullName)}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-gray-900 group-hover:text-teal-600 transition-colors">
                        {row.fullName}
                      </p>
                      <p className="text-[10.5px] text-gray-400 font-mono">{row.code}</p>
                    </div>
                  </div>
                </td>
                {/* Day cells */}
                {row.cells.map((cell) => (
                  <Cell
                    key={cell.dateStr}
                    cell={cell}
                    onMouseEnter={handleCellEnter(row.fullName)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
                {/* Summary col — total sufficient days */}
                {(() => {
                  const total = row.okDays + row.otDays;
                  return (
                    <td className="sticky right-0 border-b border-l border-gray-100 bg-white px-2.5 text-center font-mono text-[13px] font-bold"
                      style={{ color: total > 0 ? 'oklch(44% 0.16 152)' : '#aab3c2' }}>
                      {total > 0 ? total : '—'}
                    </td>
                  );
                })()}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={daysInMonth + 2}
                  className="py-16 text-center text-sm text-gray-400">
                  Không tìm thấy nhân viên phù hợp
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
}
