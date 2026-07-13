'use client';

import { useState } from 'react';
import {
  type EmployeeRow, type DayCell, type CellStatus,
  STATUS_META,
  isoDateStr, countWorkingDays, fmtDistanceKm,
} from './admin-attendance-report-types';

// ─── Colour tokens ────────────────────────────────────────────────────────────

const C: Record<CellStatus, { bg: string; color: string }> = {
  ok:      { bg: 'oklch(54% 0.16 152 / 0.12)', color: 'oklch(54% 0.16 152)' },
  late:    { bg: 'oklch(58% 0.20 28  / 0.12)', color: 'oklch(58% 0.20 28)'  },
  early:   { bg: 'oklch(54% 0.13 245 / 0.12)', color: 'oklch(54% 0.13 245)' },
  annual:  { bg: 'oklch(60% 0.15 75  / 0.15)', color: 'oklch(60% 0.15 75)'  },
  unpaid:  { bg: 'oklch(50% 0.10 60  / 0.13)', color: 'oklch(50% 0.10 60)'  },
  special: { bg: 'oklch(54% 0.16 290 / 0.12)', color: 'oklch(54% 0.16 290)' },
  holiday: { bg: 'oklch(56% 0.18 330 / 0.12)', color: 'oklch(56% 0.18 330)' },
  ot:      { bg: 'oklch(60% 0.17 45  / 0.14)', color: 'oklch(60% 0.17 45)'  },
  absent:  { bg: 'oklch(52% 0.22 18  / 0.12)', color: 'oklch(52% 0.22 18)'  },
  off:     { bg: '#f1f3f6',                     color: '#aab3c2'              },
  future:  { bg: '#f7f9fc',                     color: '#aab3c2'              },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTH_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual:  'Phép năm',
  sick:    'Phép ốm',
  compensatory: 'Phép bù',
  unpaid:  'Không lương',
  special: 'Phép ĐB',
};

function StatusBadge({ status }: { status: CellStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[11px] font-semibold"
      style={{ background: C[status].bg, color: C[status].color }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: C[status].color }} />
      {meta.label}
    </span>
  );
}

/** Small secondary indicator pills shown below the primary status badge. */
function SecondaryBadges({ cell }: { cell: DayCell }) {
  const items: { label: string; bg: string; color: string }[] = [];

  if ((cell.lateMinutes ?? 0) > 0)
    items.push({ label: 'Đi muộn', bg: 'oklch(58% 0.20 28 / 0.12)', color: 'oklch(48% 0.20 28)' });

  if ((cell.earlyMinutes ?? 0) > 0)
    items.push({ label: 'Về sớm', bg: 'oklch(54% 0.13 245 / 0.12)', color: 'oklch(44% 0.13 245)' });

  if (cell.isCorrected || cell.correctionStatus === 'approved')
    items.push({ label: 'Đã điều chỉnh', bg: 'oklch(71% 0.10 295 / 0.15)', color: 'oklch(46% 0.14 295)' });

  // Gate on hasCheckinGps/hasCheckoutGps (was GPS captured at all) rather than
  // isInOffice (boolean, defaults false with no "unknown" state) or officeDistanceM
  // (only set when the employee has a personal office assigned — most orgs rely on
  // branch/geofence validation instead, so officeDistanceM is null even for valid data).
  if (cell.hasCheckinGps) {
    const dist = cell.officeDistanceM != null ? ` (${fmtDistanceKm(cell.officeDistanceM)})` : '';
    if (cell.isInOffice)
      items.push({ label: `Vào: Trong VP${dist}`, bg: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(44% 0.16 152)' });
    else
      items.push({ label: `Vào: Ngoài VP${dist}`, bg: 'oklch(52% 0.22 18 / 0.12)', color: 'oklch(52% 0.22 18)' });
  }

  if (cell.checkoutTime && cell.hasCheckoutGps) {
    const dist = cell.checkoutOfficeDistanceM != null ? ` (${fmtDistanceKm(cell.checkoutOfficeDistanceM)})` : '';
    if (cell.checkoutIsInOffice)
      items.push({ label: `Ra: Trong VP${dist}`, bg: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(44% 0.16 152)' });
    else
      items.push({ label: `Ra: Ngoài VP${dist}`, bg: 'oklch(52% 0.22 18 / 0.12)', color: 'oklch(52% 0.22 18)' });
  }

  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map(({ label, bg, color }) => (
        <span key={label}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: bg, color }}>
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── Stats panel ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, pct }: {
  label: string; value: React.ReactNode; sub: string; color: string; pct?: number;
}) {
  return (
    <div className="flex flex-col gap-1 bg-white p-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold leading-tight tracking-tight tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-gray-400">{sub}</div>
      {pct !== undefined && pct > 0 && (
        <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

function MiniCalendar({ cells, year, month, todayDay }: {
  cells: DayCell[]; year: number; month: number; todayDay: number;
}) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  // Monday-first offset
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {['T2','T3','T4','T5','T6','T7','CN'].map((d) => (
        <div key={d} className="pb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">
          {d}
        </div>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <div key={`e${i}`} />
      ))}
      {cells.map((cell) => {
        const isToday = cell.day === todayDay;
        const sub = cell.lateMinutes && cell.lateMinutes > 0
          ? `${cell.lateMinutes}p`
          : cell.otHours && cell.otHours > 0 ? `${cell.otHours}h` : null;

        return (
          <div
            key={cell.dateStr}
            className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-[11px]"
            style={{
              background: C[cell.status === 'ot' ? 'ok' : cell.status].bg,
              color: C[cell.status === 'ot' ? 'ok' : cell.status].color,
              boxShadow: isToday ? `inset 0 0 0 2px oklch(55% 0.13 200)` : undefined,
              opacity: cell.status === 'future' ? 0.5 : 1,
            }}
          >
            <span className="text-[13px] font-bold leading-none">{cell.day}</span>
            {sub && <span className="font-mono text-[9px] leading-none">{sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

interface DeleteTarget {
  id: number;
  dateStr: string;
  shiftLabel?: string;
}

function DeleteConfirmModal({ target, onConfirm, onCancel, loading }: {
  target: DeleteTarget;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: 'oklch(52% 0.22 18 / 0.12)' }}>
          <span className="text-lg" style={{ color: 'oklch(42% 0.22 18)' }}>⚠</span>
        </div>
        <h3 className="mb-1 text-[15px] font-bold text-gray-900">Xác nhận xóa chấm công</h3>
        <p className="mb-4 text-[13px] text-gray-500">
          Bạn có chắc muốn xóa bản ghi chấm công ngày{' '}
          <span className="font-semibold text-gray-800">{target.dateStr}</span>
          {target.shiftLabel && (
            <> — ca <span className="font-semibold text-gray-800">{target.shiftLabel}</span></>
          )}
          ? Dữ liệu sẽ bị ẩn và không thể khôi phục qua giao diện.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition disabled:opacity-50"
            style={{ background: loading ? 'oklch(62% 0.22 18)' : 'oklch(52% 0.22 18)' }}
          >
            {loading ? 'Đang xóa…' : 'Xóa bản ghi'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared cell helpers ─────────────────────────────────────────────────────

function CellCheckin({ time }: { time?: string | null }) {
  return time ? <span className="font-mono text-gray-700">{time}</span> : <span className="text-gray-300">—</span>;
}

function CellHours({ hours }: { hours?: number }) {
  return (hours ?? 0) > 0
    ? <span className="font-mono" style={{ color: 'oklch(44% 0.16 152)' }}>{hours}h</span>
    : <span className="text-gray-300">—</span>;
}

function CellMinutes({ minutes, colorKey }: { minutes?: number; colorKey: 'late' | 'early' }) {
  return (minutes ?? 0) > 0
    ? <span className="rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold"
        style={{ background: C[colorKey].bg, color: C[colorKey].color }}>{minutes}p</span>
    : <span className="text-gray-300">—</span>;
}

function CellCorrection({ status }: { status?: string }) {
  if (status === 'pending') return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: 'oklch(70% 0.18 50 / 0.15)', color: 'oklch(55% 0.18 50)' }}>● Chờ duyệt</span>
  );
  if (status === 'approved') return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: 'oklch(54% 0.16 152 / 0.12)', color: 'oklch(44% 0.16 152)' }}>✓ Đã duyệt</span>
  );
  if (status === 'rejected') return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: 'oklch(52% 0.22 18 / 0.12)', color: 'oklch(42% 0.22 18)' }}>✗ Từ chối</span>
  );
  return <span className="text-gray-300">—</span>;
}

function DeleteBtn({ id, dateStr, shiftLabel, onDeleteRequest }: {
  id?: number; dateStr: string; shiftLabel?: string;
  onDeleteRequest?: (target: DeleteTarget) => void;
}) {
  if (!id) return <span className="text-gray-300">—</span>;
  return (
    <button
      onClick={() => onDeleteRequest?.({ id, dateStr, shiftLabel })}
      className="rounded px-2 py-1 text-[11px] font-semibold transition hover:opacity-80"
      style={{ background: 'oklch(52% 0.22 18 / 0.10)', color: 'oklch(42% 0.22 18)' }}
    >
      Xóa
    </button>
  );
}

// ─── Daily log table ──────────────────────────────────────────────────────────

function DailyLog({ cells, month, todayDay, isAdmin, onDeleteRequest }: {
  cells: DayCell[]; month: number; todayDay: number;
  isAdmin?: boolean;
  onDeleteRequest?: (target: DeleteTarget) => void;
}) {
  // Determine if any cell has multi-shift data (CC mode)
  const isShiftMode = cells.some(c => c.shifts && c.shifts.length > 0);

  const headers = ['Ngày', 'Thứ'];
  if (isShiftMode) headers.push('Ca');
  headers.push('Trạng thái', 'Vào', 'Ra', 'Tổng giờ', 'Trễ', 'Sớm', 'Ghi chú', 'Yêu cầu');
  if (isAdmin) headers.push('Xóa');

  const tdBase = 'border-b border-gray-50 px-3.5 py-2.5';

  return (
    <div className="overflow-auto" style={{ maxHeight: 500 }}>
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}
                className="sticky top-0 z-[2] border-b border-gray-100 bg-gray-50 px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => {
            const isSun = cell.dow === 0 || cell.dow === 6;
            const isToday = cell.day === todayDay;
            const dateStr = `${String(cell.day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
            const rowBg = isToday ? 'oklch(55% 0.13 200 / 0.07)' : undefined;

            // ── SHIFT / CC mode: expand each shift into its own row ──────────
            if (isShiftMode && cell.shifts && cell.shifts.length > 0) {
              const rowSpan = cell.shifts.length;
              return cell.shifts.map((shift, si) => (
                <tr key={`${cell.dateStr}-${si}`} className="hover:bg-gray-50" style={rowBg ? { background: rowBg } : undefined}>
                  {/* Date + Day: only on the first shift row, spanning all rows for that day */}
                  {si === 0 && (
                    <>
                      <td rowSpan={rowSpan}
                        className={`${tdBase} font-mono font-semibold align-top pt-3 ${isSun ? 'text-red-500' : 'text-gray-800'}`}>
                        {dateStr}
                      </td>
                      <td rowSpan={rowSpan}
                        className={`${tdBase} align-top pt-3 ${isSun ? 'text-red-400' : 'text-gray-400'}`}>
                        {DOW_VI[cell.dow]}
                      </td>
                    </>
                  )}
                  {/* Shift name badge */}
                  <td className={tdBase}>
                    <span className="inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] font-semibold bg-gray-100 text-gray-600">
                      {shift.shiftName ?? shift.shiftCode}
                    </span>
                  </td>
                  <td className={tdBase}>
                    <StatusBadge status={shift.status === 'ot' ? 'ok' : shift.status} />
                    {/* Leave type + full/half day pill for leave shifts */}
                    {(shift.status === 'annual' || shift.status === 'unpaid' || shift.status === 'special') && (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: 'oklch(60% 0.15 75 / 0.15)', color: 'oklch(40% 0.15 75)' }}>
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'oklch(60% 0.15 75)' }} />
                          {LEAVE_TYPE_LABEL[shift.status]}
                          {' · '}{shift.isHalfDay ? 'Nửa ca' : 'Cả ngày'}
                        </span>
                      </div>
                    )}
                    {/* Show secondary pill only when status badge doesn't already convey it */}
                    {(shift.lateMinutes ?? 0) > 0 && shift.status !== 'late' && (
                      <div className="mt-1">
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: C.late.bg, color: C.late.color }}>Đi trễ</span>
                      </div>
                    )}
                    {(shift.earlyMinutes ?? 0) > 0 && shift.status !== 'early' && (
                      <div className="mt-1">
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: C.early.bg, color: C.early.color }}>Về sớm</span>
                      </div>
                    )}
                    {shift.hasCheckinGps && (
                      <div className="mt-1">
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={shift.isInOffice
                            ? { background: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(40% 0.16 152)' }
                            : { background: 'oklch(52% 0.22 18 / 0.12)', color: 'oklch(52% 0.22 18)' }}>
                          Vào: {shift.isInOffice ? 'Trong VP' : 'Ngoài VP'}{shift.officeDistanceM != null ? ` (${fmtDistanceKm(shift.officeDistanceM)})` : ''}
                        </span>
                      </div>
                    )}
                    {shift.checkoutTime && shift.hasCheckoutGps && (
                      <div className="mt-1">
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={shift.checkoutIsInOffice
                            ? { background: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(40% 0.16 152)' }
                            : { background: 'oklch(52% 0.22 18 / 0.12)', color: 'oklch(52% 0.22 18)' }}>
                          Ra: {shift.checkoutIsInOffice ? 'Trong VP' : 'Ngoài VP'}{shift.checkoutOfficeDistanceM != null ? ` (${fmtDistanceKm(shift.checkoutOfficeDistanceM)})` : ''}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className={tdBase}><CellCheckin time={shift.checkinTime} /></td>
                  <td className={tdBase}><CellCheckin time={shift.checkoutTime} /></td>
                  <td className={tdBase}><CellHours hours={shift.workingHours} /></td>
                  <td className={tdBase}><CellMinutes minutes={shift.lateMinutes} colorKey="late" /></td>
                  <td className={tdBase}><CellMinutes minutes={shift.earlyMinutes} colorKey="early" /></td>
                  <td className={`${tdBase} max-w-[180px]`}>
                    <span className="text-gray-300">—</span>
                  </td>
                  <td className={tdBase}>
                    <CellCorrection status={shift.correctionStatus} />
                  </td>
                  {isAdmin && (
                    <td className={tdBase}>
                      <DeleteBtn
                        id={shift.attendanceId}
                        dateStr={dateStr}
                        shiftLabel={shift.shiftName ?? shift.shiftCode}
                        onDeleteRequest={onDeleteRequest}
                      />
                    </td>
                  )}
                </tr>
              ));
            }

            // ── FIXED mode: single row per day ───────────────────────────────
            return (
              <tr key={cell.dateStr} className="hover:bg-gray-50" style={rowBg ? { background: rowBg } : undefined}>
                <td className={`${tdBase} font-mono font-semibold ${isSun ? 'text-red-500' : 'text-gray-800'}`}>
                  {dateStr}
                </td>
                <td className={`${tdBase} ${isSun ? 'text-red-400' : 'text-gray-400'}`}>
                  {DOW_VI[cell.dow]}
                </td>
                {/* Keep column count in sync with the header when other days in this table use per-shift rows */}
                {isShiftMode && (
                  <td className={tdBase}><span className="text-gray-300">—</span></td>
                )}
                <td className={tdBase}>
                  <StatusBadge status={cell.status === 'ot' ? 'ok' : cell.status} />
                  {cell.leaveType && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'oklch(60% 0.15 75 / 0.15)', color: 'oklch(40% 0.15 75)' }}>
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'oklch(60% 0.15 75)' }} />
                        {LEAVE_TYPE_LABEL[cell.leaveType] ?? cell.leaveType}
                        {' · '}{cell.isHalfDay ? 'Nửa ngày' : 'Cả ngày'}
                      </span>
                    </div>
                  )}
                  <SecondaryBadges cell={cell} />
                </td>
                <td className={tdBase}><CellCheckin time={cell.checkinTime} /></td>
                <td className={tdBase}><CellCheckin time={cell.checkoutTime} /></td>
                <td className={tdBase}><CellHours hours={cell.workingHours} /></td>
                <td className={tdBase}><CellMinutes minutes={cell.lateMinutes} colorKey="late" /></td>
                <td className={tdBase}><CellMinutes minutes={cell.earlyMinutes} colorKey="early" /></td>
                <td className={`${tdBase} max-w-[200px]`}>
                  {(() => {
                    const notes: { label: string; text: string }[] = [];
                    if (cell.note)                 notes.push({ label: '', text: cell.note });
                    if (cell.checkinNote)          notes.push({ label: 'Vào', text: cell.checkinNote });
                    if (cell.checkoutNote)         notes.push({ label: 'Ra', text: cell.checkoutNote });
                    if (cell.locationNote)         notes.push({ label: 'Địa điểm', text: cell.locationNote });
                    if (cell.correctionReason)     notes.push({ label: 'Lý do ĐC', text: cell.correctionReason });
                    if (cell.correctionReviewNote) notes.push({ label: 'Ghi chú duyệt', text: cell.correctionReviewNote });
                    if (notes.length === 0) return <span className="text-gray-300">—</span>;
                    return (
                      <div className="space-y-0.5">
                        {notes.map(({ label, text }, i) => (
                          <p key={i} className="text-[11.5px] text-gray-600 leading-snug">
                            {label && <span className="font-semibold text-gray-400 mr-1">{label}:</span>}
                            {text}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                </td>
                <td className={tdBase}>
                  <CellCorrection status={cell.correctionStatus} />
                </td>
                {isAdmin && (
                  <td className={tdBase}>
                    <DeleteBtn id={cell.attendanceId} dateStr={dateStr} onDeleteRequest={onDeleteRequest} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  row: EmployeeRow;
  year: number;
  month: number;
  todayDay: number;
  workingMode?: 'FIXED' | 'SHIFT';
  isAdmin?: boolean;
  /** For CC employees: total shift slots from EmployeeShiftSchedule for this month */
  scheduledShifts?: number;
  onDeleteRecord?: (id: number) => Promise<void>;
}

export function AdminAttendanceDetailView({ row, year, month, todayDay, workingMode, isAdmin, scheduledShifts: scheduledShiftsProp, onDeleteRecord }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onDeleteRecord) return;
    setDeleting(true);
    try {
      await onDeleteRecord(deleteTarget.id);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };
  const isFixed = workingMode !== 'SHIFT';
  const workingDays = countWorkingDays(year, month);
  const scheduledCells = row.cells.filter(c => !['off', 'holiday', 'future'].includes(c.status));
  const attended = row.cells.filter(c => ['ok','late','early','ot'].includes(c.status)).length;
  const totalShifts = row.cells.reduce((s, c) =>
    s + (c.shifts ? c.shifts.filter(sh => !!sh.checkinTime).length : (c.checkinTime ? 1 : 0)), 0);

  // For CC employees: use shift assignment count from EmployeeShiftSchedule (authoritative).
  // Fall back to counting shift attendance records if prop not provided.
  const totalScheduledShifts = scheduledShiftsProp ??
    row.cells.reduce((s, c) => s + (c.shifts?.length ?? 0), 0);

  const earlyDays  = row.cells.filter(c => c.status === 'early').length;
  const totalEarlyMin = row.cells.reduce((s, c) => s + (c.earlyMinutes ?? 0), 0);
  const specialDays = row.cells.filter(c => c.status === 'special').length;
  // Days where employee attended and worked sufficient hours (matches grid isSufficient logic)
  const suffDays = row.cells.filter(c => {
    if (!c.checkinTime || c.hasNoCheckout) return false;
    return (c.normalHours ?? 0) > 0
      ? (c.workingHours ?? 0) >= (c.normalHours ?? 0)
      : c.status === 'ok' || c.status === 'ot';
  }).length;
  const insuffShifts = row.cells.reduce((s, c) => {
    if (c.shifts) {
      return s + c.shifts.filter(sh =>
        !!sh.checkinTime &&
        (sh.normalHours ?? 0) > 0 &&
        (sh.workingHours ?? 0) < (sh.normalHours ?? 0)
      ).length;
    }
    const insuff = !!c.checkinTime && (c.normalHours ?? 0) > 0 && (c.workingHours ?? 0) < (c.normalHours ?? 0);
    return s + (insuff ? 1 : 0);
  }, 0);

  // Office location totals — mirrors shift-vs-cell fallback used above (prefer per-shift
  // entries when present, else the cell-level fields), gated on hasCheckinGps/hasCheckoutGps
  // so days without any GPS data are excluded rather than miscounted as "outside".
  const officeStats = row.cells.reduce((acc, c) => {
    const items = c.shifts && c.shifts.length > 0 ? c.shifts : [c];
    items.forEach((it) => {
      if (it.hasCheckinGps) { if (it.isInOffice) acc.checkinIn++; else acc.checkinOut++; }
      if (it.checkoutTime && it.hasCheckoutGps) { if (it.checkoutIsInOffice) acc.checkoutIn++; else acc.checkoutOut++; }
    });
    return acc;
  }, { checkinIn: 0, checkinOut: 0, checkoutIn: 0, checkoutOut: 0 });

  return (
    <div className="space-y-4 animate-[fadeUp_.25s_ease_both]">
      {deleteTarget && (
        <DeleteConfirmModal
          target={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
      {/* Stats */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-[13.5px] font-semibold text-gray-800">
            Tổng quan {MONTH_VI[month - 1]} {year}
          </span>
          <div className="flex items-center gap-2">
            {(officeStats.checkinOut + officeStats.checkoutOut) > 0 && (
              <span
                title={`${officeStats.checkinOut} lần vào ngoài VP · ${officeStats.checkoutOut} lần ra ngoài VP`}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: 'oklch(52% 0.22 18 / 0.12)', color: 'oklch(52% 0.22 18)' }}
              >
                Ngoài VP: {officeStats.checkinOut} vào · {officeStats.checkoutOut} ra
              </span>
            )}
            <span className="text-[11.5px] text-gray-400">{workingDays} ngày công chuẩn</span>
          </div>
        </div>
        {isFixed ? (
          /* FIXED schedule: 8 cards, 4 per row */
          <div className="grid grid-cols-4 divide-x divide-y divide-gray-100 [&>*]:border-gray-100">
            <StatCard label="Tổng ngày công" value={totalShifts}
              sub={`${attended} ngày có mặt`} color="oklch(54% 0.16 152)"
              pct={scheduledCells.length ? attended / scheduledCells.length * 100 : 0} />
            <StatCard label="Ngày công đủ giờ" value={suffDays}
              sub={`trong ${scheduledCells.length} ngày làm việc`} color="oklch(44% 0.16 152)"
              pct={scheduledCells.length ? suffDays / scheduledCells.length * 100 : 0} />
            <StatCard label="Đúng giờ" value={row.okDays}
              sub="đúng giờ, đủ giờ" color="oklch(44% 0.16 152)"
              pct={scheduledCells.length ? row.okDays / scheduledCells.length * 100 : 0} />
            <StatCard label="Đi trễ" value={row.lateDays}
              sub={row.totalLateMin > 0 ? `${row.totalLateMin} phút tổng` : 'không có'}
              color="oklch(58% 0.20 28)"
              pct={scheduledCells.length ? row.lateDays / scheduledCells.length * 100 : 0} />
            <StatCard label="Về sớm" value={earlyDays}
              sub={totalEarlyMin > 0 ? `${totalEarlyMin} phút tổng` : 'không có'}
              color="oklch(54% 0.13 245)"
              pct={scheduledCells.length ? earlyDays / scheduledCells.length * 100 : 0} />
            <StatCard label="Phép năm" value={row.annualDays}
              sub="ngày có lương" color="oklch(60% 0.15 75)" />
            <StatCard label="Nghỉ ĐB" value={specialDays}
              sub="ngày có lương" color="oklch(54% 0.16 290)" />
            <StatCard label="Vắng mặt" value={row.absentDays}
              sub={row.absentDays > 0 ? 'không phép' : 'không có'}
              color="oklch(52% 0.22 18)" />
          </div>
        ) : (
          /* SHIFT (CC): 10-card layout — row1: Tổng số ca | Số ca được phân | Ca đủ giờ | Đúng giờ | Ca thiếu giờ  row2: Đi trễ | Về sớm | Phép năm | Nghỉ ĐB | Vắng mặt */
          <div className="grid grid-cols-5 divide-x divide-y divide-gray-100 [&>*]:border-gray-100">
            <StatCard label="Tổng số ca" value={totalShifts}
              sub={`${attended} ngày có mặt`} color="oklch(54% 0.16 152)"
              pct={totalScheduledShifts ? totalShifts / totalScheduledShifts * 100 : 0} />
            <StatCard label="Số ca được phân" value={totalScheduledShifts}
              sub={totalScheduledShifts > 0 ? `${totalShifts} ca đã chấm công` : 'chưa có ca'}
              color="oklch(46% 0.12 220)" />
            <StatCard label="Ca đủ giờ" value={suffDays}
              sub={`${row.okDays} đúng giờ + ${row.otDays} OT`} color="oklch(44% 0.16 152)"
              pct={totalScheduledShifts ? suffDays / totalScheduledShifts * 100 : 0} />
            <StatCard label="Đúng giờ" value={row.okDays}
              sub="không trễ, đủ giờ" color="oklch(54% 0.16 152)"
              pct={totalScheduledShifts ? row.okDays / totalScheduledShifts * 100 : 0} />
            <StatCard label="Ca thiếu giờ" value={insuffShifts}
              sub={insuffShifts > 0 ? 'ca chưa đủ giờ quy định' : 'không có'}
              color="oklch(48% 0.15 75)" />
            <StatCard label="Đi trễ" value={row.lateDays}
              sub={`${row.totalLateMin} phút tổng`} color="oklch(58% 0.20 28)"
              pct={totalScheduledShifts ? row.lateDays / totalScheduledShifts * 100 : 0} />
            <StatCard label="Về sớm" value={earlyDays}
              sub={`${totalEarlyMin} phút tổng`} color="oklch(54% 0.13 245)"
              pct={totalScheduledShifts ? earlyDays / totalScheduledShifts * 100 : 0} />
            <StatCard label="Phép năm" value={row.annualDays}
              sub="ngày có lương" color="oklch(60% 0.15 75)" />
            <StatCard label="Nghỉ ĐB" value={specialDays}
              sub="ngày có lương" color="oklch(54% 0.16 290)" />
            <StatCard label="Vắng mặt" value={row.absentDays}
              sub={row.absentDays > 0 ? 'không phép' : 'không có'}
              color="oklch(52% 0.22 18)" />
          </div>
        )}
      </div>

      {/* Daily log */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-[13.5px] font-semibold text-gray-800">Nhật ký chấm công từng ngày</span>
          <span className="text-[11.5px] text-gray-400">{row.cells.length} ngày trong tháng</span>
        </div>
        <DailyLog
          cells={row.cells}
          month={month}
          todayDay={todayDay}
          isAdmin={isAdmin}
          onDeleteRequest={setDeleteTarget}
        />
      </div>

      {/* Calendar + (future: payroll) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-[13.5px] font-semibold text-gray-800">Lịch tháng — trực quan</span>
            <span className="text-[11.5px] text-gray-400">
              {attended} ca thực tế / {scheduledCells.length} ca chuẩn
            </span>
          </div>
          <div className="p-4">
            <MiniCalendar cells={row.cells} year={year} month={month} todayDay={todayDay} />
          </div>
        </div>

        {/* Legend panel */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <span className="text-[13.5px] font-semibold text-gray-800">Chú thích trạng thái</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-2">
            {(Object.entries(STATUS_META) as [CellStatus, typeof STATUS_META[CellStatus]][])
              .filter(([s]) => !['future','off','ot'].includes(s))
              .map(([s, meta]) => (
                <div key={s} className="flex items-center gap-2.5">
                  <span className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center font-mono text-[10px] font-semibold"
                    style={{ background: C[s].bg, color: C[s].color }}>
                    {meta.short}
                  </span>
                  <span className="text-[12.5px] text-gray-600">{meta.label}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
