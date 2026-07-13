'use client';

import type { DayCell, CellStatus, ShiftEntry } from './admin-attendance-report-types';
import { STATUS_META, fmtDistanceKm } from './admin-attendance-report-types';

// ─── Colour tokens — same palette as the fixed-schedule grid ─────────────────

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

const SUFFICIENT_BG    = 'oklch(54% 0.16 152 / 0.15)';
const SUFFICIENT_COLOR = 'oklch(44% 0.16 152)';
const INCOMPLETE_BG    = 'oklch(60% 0.15 75  / 0.18)';
const INCOMPLETE_COLOR = 'oklch(46% 0.15 75)';

/** Cell background/color — priority matches glyph: Đủ giờ → Đi trễ → Về sớm → Chưa checkout → status */
function cellStyle(shift: ShiftEntry): { background: string; color: string } {
  const { status, hasNoCheckout, workingHours, normalHours, checkinTime, lateMinutes } = shift;
  const isSufficient = !!checkinTime && !hasNoCheckout && (
    (normalHours ?? 0) > 0
      ? (workingHours ?? 0) >= (normalHours ?? 0)
      : status === 'ok' || status === 'ot'
  );
  if (isSufficient)                             return { background: SUFFICIENT_BG,          color: SUFFICIENT_COLOR          };
  if (status === 'late' || (lateMinutes ?? 0) > 0) return { background: CELL_STYLE.late.bg,  color: CELL_STYLE.late.color     };
  if (status === 'early')                       return { background: CELL_STYLE.early.bg,    color: CELL_STYLE.early.color    };
  if (hasNoCheckout)                            return { background: INCOMPLETE_BG,          color: INCOMPLETE_COLOR          };
  const cs = CELL_STYLE[status];
  if (cs) return { background: cs.bg, color: cs.color };
  // checkin exists but status unrecognised — treat as insufficient
  if (checkinTime) return { background: INCOMPLETE_BG, color: INCOMPLETE_COLOR };
  return { background: CELL_STYLE.ok.bg, color: CELL_STYLE.ok.color };
}

/** Icon for a shift entry — priority: Đủ giờ → Đi trễ → Về sớm → Chưa checkout → Thiếu giờ → Vắng */
function cellGlyph(shift: ShiftEntry): React.ReactNode {
  const { status, hasNoCheckout, workingHours, normalHours, checkinTime, lateMinutes } = shift;
  const isSufficient = !!checkinTime && !hasNoCheckout && (
    (normalHours ?? 0) > 0
      ? (workingHours ?? 0) >= (normalHours ?? 0)
      : status === 'ok' || status === 'ot'
  );
  const isInsufficient = !!checkinTime && !hasNoCheckout && (normalHours ?? 0) > 0
    && (workingHours ?? 0) < (normalHours ?? 0);

  if (isSufficient)                                  return <span className="text-[15px] leading-none font-bold">✓</span>;
  if (status === 'late' || (lateMinutes ?? 0) > 0)   return <span>!</span>;
  if (status === 'early')                            return <span className="text-[12px]">↩</span>;
  if (hasNoCheckout)                                 return <span className="text-[12px] font-bold">?</span>;
  if (isInsufficient)                                return <span>!</span>;
  if (status === 'absent')                           return <span>✗</span>;
  if (status === 'annual')                           return shift.isHalfDay ? <span className="text-[9px]">½P</span> : <span>P</span>;
  if (status === 'unpaid')                           return shift.isHalfDay ? <span className="text-[9px]">½KL</span> : <span>KL</span>;
  if (status === 'special')                          return shift.isHalfDay ? <span className="text-[9px]">½ĐB</span> : <span>ĐB</span>;
  if (status === 'holiday')                          return <span>L</span>;
  return <span style={{ opacity: 0.4 }}>·</span>;
}

/** Tooltip-only: colour shift row by hour sufficiency (kept for tooltip readability). */
function shiftStatusStyle(shift: ShiftEntry): { background: string; color: string } {
  const { status, hasNoCheckout, workingHours, normalHours } = shift;
  if (status === 'absent')
    return { background: 'oklch(52% 0.22 18 / 0.15)', color: 'oklch(42% 0.22 18)' };
  if (hasNoCheckout)
    return { background: 'oklch(60% 0.15 75 / 0.20)', color: 'oklch(46% 0.15 75)' };
  const sufficient = (normalHours ?? 0) > 0
    ? (workingHours ?? 0) >= (normalHours ?? 0)
    : true;
  return sufficient
    ? { background: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(44% 0.16 152)' }
    : { background: 'oklch(60% 0.15 75 / 0.18)',  color: 'oklch(46% 0.15 75)'  };
}


// ─── Tooltip ─────────────────────────────────────────────────────────────────

export interface CcTooltipData {
  empName: string;
  cell: DayCell;
  x: number;
  y: number;
}

/** Cell-level status flags shown at the top of the hover tooltip. */
function TooltipFlags({ cell }: { cell: DayCell }) {
  const shifts = cell.shifts ?? [];
  const hasLate    = (cell.lateMinutes ?? 0) > 0 || shifts.some(s => (s.lateMinutes ?? 0) > 0);
  const hasEarly   = (cell.earlyMinutes ?? 0) > 0 || shifts.some(s => (s.earlyMinutes ?? 0) > 0);
  const corrected  = cell.isCorrected || cell.correctionStatus === 'approved'
                     || shifts.some(s => s.correctionStatus === 'approved');
  const inOffice   = !!cell.hasCheckinGps && cell.isInOffice === true;
  const outOffice  = !!cell.hasCheckinGps && cell.isInOffice === false;
  const hasCheckoutGpsData = !!cell.checkoutTime && !!cell.hasCheckoutGps;
  const checkoutInOffice  = hasCheckoutGpsData && cell.checkoutIsInOffice === true;
  const checkoutOutOffice = hasCheckoutGpsData && cell.checkoutIsInOffice === false;

  if (!hasLate && !hasEarly && !corrected && !inOffice && !outOffice && !checkoutInOffice && !checkoutOutOffice) return null;

  const inDist  = cell.officeDistanceM != null ? ` (${fmtDistanceKm(cell.officeDistanceM)})` : '';
  const outDist = cell.checkoutOfficeDistanceM != null ? ` (${fmtDistanceKm(cell.checkoutOfficeDistanceM)})` : '';

  const flags: { label: string; bg: string; color: string }[] = [];
  if (hasLate)   flags.push({ label: 'Đi muộn',        bg: 'oklch(58% 0.20 28 / 0.15)',  color: 'oklch(44% 0.20 28)'  });
  if (hasEarly)  flags.push({ label: 'Về sớm',          bg: 'oklch(54% 0.13 245 / 0.15)', color: 'oklch(40% 0.13 245)' });
  if (corrected) flags.push({ label: 'Đã điều chỉnh',   bg: 'oklch(71% 0.10 295 / 0.18)', color: 'oklch(42% 0.14 295)' });
  if (inOffice)  flags.push({ label: `Vào: Trong VP${inDist}`,   bg: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(40% 0.16 152)' });
  if (outOffice) flags.push({ label: `Vào: Ngoài VP${inDist}`,   bg: 'oklch(52% 0.22 18 / 0.12)',  color: 'oklch(52% 0.22 18)'  });
  if (checkoutInOffice)  flags.push({ label: `Ra: Trong VP${outDist}`, bg: 'oklch(54% 0.16 152 / 0.15)', color: 'oklch(40% 0.16 152)' });
  if (checkoutOutOffice) flags.push({ label: `Ra: Ngoài VP${outDist}`, bg: 'oklch(52% 0.22 18 / 0.12)',  color: 'oklch(52% 0.22 18)'  });

  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {flags.map(({ label, bg, color }) => (
        <span key={label}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: bg, color }}>
          {label}
        </span>
      ))}
    </div>
  );
}

export function CcTooltip({ data }: { data: CcTooltipData }) {
  const { empName, cell } = data;
  const shifts = cell.shifts ?? [];

  return (
    <div
      className="pointer-events-none fixed z-[200] max-w-[260px] rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs shadow-xl"
      style={{ left: data.x, top: data.y }}
    >
      <p className="mb-1.5 font-semibold text-gray-900">
        {empName} <span className="font-normal text-gray-400">· Ngày {String(cell.day).padStart(2, '0')}</span>
      </p>
      <TooltipFlags cell={cell} />
      {shifts.length === 0 && LEAVE_STATUSES.includes(cell.status) ? (
        <div className="rounded-md px-2 py-1.5" style={(() => { const cs = CELL_STYLE[cell.status as CellStatus] ?? CELL_STYLE.annual; return { background: cs.bg, color: cs.color }; })()}>
          <p className="text-[11px] font-semibold">
            {cell.isHalfDay ? 'Nghỉ nửa ca' : 'Nghỉ cả ngày'}
          </p>
          <p className="text-[10px] opacity-70 mt-0.5">Chưa phân ca — đã duyệt phép</p>
        </div>
      ) : shifts.length === 0 ? (
        <p className="text-gray-400">Nghỉ</p>
      ) : (
        shifts.map((s, i) => (
          <div key={i} className="mt-1.5 rounded-md px-2 py-1.5 space-y-0.5" style={(() => { const st = cellStyle(s); return { background: st.background, color: st.color }; })()}>
            {/* shift header: code + name */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-[11px]">{s.shiftCode}</span>
              {s.shiftName && <span className="text-[10px] opacity-70">{s.shiftName}</span>}
            </div>
            {/* leave indicator */}
            {!s.checkinTime && (s.status === 'annual' || s.status === 'unpaid' || s.status === 'special') && (
              <div className="text-[10px] opacity-80">
                {s.isHalfDay ? 'Nghỉ nửa ca' : 'Nghỉ cả ngày'}
              </div>
            )}
            {/* times */}
            {s.checkinTime && (
              <div className="text-[10px] font-mono opacity-80">
                {s.checkinTime} → {s.checkoutTime ?? '—'}
              </div>
            )}
            {/* working hours + sufficient indicator */}
            {s.checkinTime && (() => {
              const sufficient = !s.hasNoCheckout && (s.normalHours ?? 0) > 0 && (s.workingHours ?? 0) >= (s.normalHours ?? 0);
              const insufficient = !s.hasNoCheckout && (s.normalHours ?? 0) > 0 && (s.workingHours ?? 0) < (s.normalHours ?? 0);
              return (
                <div className="text-[10px] opacity-80 flex items-center gap-1 flex-wrap">
                  <span>Giờ làm: <span className="font-semibold">{(s.workingHours ?? 0) > 0 ? `${s.workingHours}h` : '—'}</span></span>
                  {sufficient && (
                    <span className="rounded px-1 py-0.5 text-[9px] font-semibold"
                      style={{ background: 'oklch(54% 0.16 152 / 0.20)', color: 'oklch(38% 0.16 152)' }}>
                      ✓ Đủ giờ
                    </span>
                  )}
                  {insufficient && (
                    <span className="rounded px-1 py-0.5 text-[9px] font-semibold"
                      style={{ background: 'oklch(58% 0.20 28 / 0.15)', color: 'oklch(44% 0.20 28)' }}>
                      ✗ Thiếu
                    </span>
                  )}
                </div>
              );
            })()}
            {/* status flags */}
            {s.hasNoCheckout && (
              <div className="text-[10px]" style={{ color: 'oklch(58% 0.18 50)' }}>
                ⚠ Chưa checkout
              </div>
            )}
            {(s.lateMinutes ?? 0) > 0 && (
              <div className="text-[10px]" style={{ color: 'oklch(48% 0.20 28)' }}>
                Đi trễ: <span className="font-semibold">+{s.lateMinutes}p</span>
              </div>
            )}
            {(s.earlyMinutes ?? 0) > 0 && (
              <div className="text-[10px]" style={{ color: 'oklch(46% 0.15 75)' }}>
                Về sớm: <span className="font-semibold">-{s.earlyMinutes}p</span>
              </div>
            )}
            {s.correctionStatus === 'pending' && (
              <div className="text-[10px] font-semibold" style={{ color: 'oklch(55% 0.18 50)' }}>● Chờ duyệt chỉnh sửa</div>
            )}
            {s.correctionStatus === 'approved' && (
              <div className="text-[10px] font-semibold" style={{ color: 'oklch(44% 0.16 152)' }}>✓ Đã duyệt chỉnh sửa</div>
            )}
            {s.correctionStatus === 'rejected' && (
              <div className="text-[10px] font-semibold" style={{ color: 'oklch(42% 0.22 18)' }}>✗ Yêu cầu bị từ chối</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Single shift badge (used in multi-shift stacked layout) ─────────────────

function ShiftBadge({ shift, rounded }: { shift: ShiftEntry; rounded: string }) {
  const style = cellStyle(shift);
  return (
    <div
      className={`h-4 flex shrink-0 items-center justify-center font-mono text-[9px] font-bold relative ${rounded}`}
      style={{ background: style.background, color: style.color }}
    >
      {cellGlyph(shift)}
      {shift.correctionStatus && (
        <span className="absolute top-[1px] left-[1px] h-1 w-1 rounded-full shadow-[0_0_0_1px_white]"
          style={{ background: 'oklch(58% 0.16 295)' }} />
      )}
    </div>
  );
}

// ─── CC Cell ─────────────────────────────────────────────────────────────────

interface CcCellProps {
  cell: DayCell;
  dow?: number;
  onMouseEnter: (e: React.MouseEvent, c: DayCell) => void;
  onMouseLeave: () => void;
}

/** Consistent border style for day-column cells; Saturday gets a thicker week separator. */
function dayCellStyle(dow?: number): React.CSSProperties {
  return dow === 6
    ? { borderRight: '2px solid #9ca3af', borderBottom: '1px solid #e5e7eb' }
    : { borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' };
}

const LEAVE_STATUSES: string[] = ['annual', 'unpaid', 'special'];

export function CcCell({ cell, dow, onMouseEnter, onMouseLeave }: CcCellProps) {
  const shifts = cell.shifts ?? [];
  const isCellLeave = LEAVE_STATUSES.includes(cell.status) && shifts.length === 0;
  const isOff = !isCellLeave && (cell.status === 'off' || cell.status === 'future' || shifts.length === 0);
  const isDouble = shifts.length >= 2;

  // No attendance records but approved leave covers this day → full-width P badge
  if (isCellLeave) {
    const cs = CELL_STYLE[cell.status as CellStatus] ?? CELL_STYLE.annual;
    const label = cell.isHalfDay ? '½P' : 'P';
    return (
      <td className="day-cell w-12 min-w-[48px] p-0.5" style={dayCellStyle(dow)}
        onMouseEnter={(e) => onMouseEnter(e, cell)} onMouseLeave={onMouseLeave}>
        <div className="relative flex h-[34px] w-full items-center justify-center rounded-[5px] font-mono text-[11px] font-bold"
          style={{ background: cs.bg, color: cs.color }}>
          {label}
        </div>
      </td>
    );
  }

  if (isOff) {
    return (
      <td
        className="day-cell w-12 min-w-[48px] p-0.5"
        style={dayCellStyle(dow)}
        onMouseEnter={(e) => onMouseEnter(e, cell)}
        onMouseLeave={onMouseLeave}
      >
        <div className="flex h-[34px] w-full items-center justify-center font-mono text-[11px] text-gray-300">·</div>
      </td>
    );
  }

  if (isDouble) {
    return (
      <td
        className="day-cell w-12 min-w-[48px] p-0.5"
        style={dayCellStyle(dow)}
        onMouseEnter={(e) => onMouseEnter(e, cell)}
        onMouseLeave={onMouseLeave}
      >
        <div className="flex w-full flex-col gap-[1px]">
          {shifts.map((shift, i) => (
            <ShiftBadge
              key={i}
              shift={shift}
              rounded={
                i === 0 ? 'rounded-t-[3px]' :
                i === shifts.length - 1 ? 'rounded-b-[3px]' :
                'rounded-none'
              }
            />
          ))}
        </div>
      </td>
    );
  }

  // Single shift — same icon set as fixed-schedule grid, no S/C/D codes
  const s     = shifts[0];
  const style = cellStyle(s);
  return (
    <td
      className="day-cell w-12 min-w-[48px] p-0.5"
      style={dayCellStyle(dow)}
      onMouseEnter={(e) => onMouseEnter(e, cell)}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="relative flex h-[34px] w-full items-center justify-center rounded-[5px] font-mono text-[11px] font-bold"
        style={{ background: style.background, color: style.color }}
      >
        {cellGlyph(s)}
        {(cell.isCorrected || (s.correctionStatus ?? cell.correctionStatus)) && (
          <span className="absolute top-[2px] left-[2px] h-1.5 w-1.5 rounded-full shadow-[0_0_0_1px_white]"
            style={{ background: 'oklch(58% 0.16 295)' }} />
        )}
      </div>
    </td>
  );
}

// ─── Coverage row cell ────────────────────────────────────────────────────────

interface CoverageData {
  /** Count per day index (0-based) */
  counts: number[];
}

export function CoverageRow({
  label, counts, daysInMonth, year, month,
}: { label: string; counts: number[]; daysInMonth: number; year: number; month: number }) {
  return (
    <tr>
      <td
        className="sticky left-0 z-[5] border-b border-r-2 border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold text-gray-500"
        style={{ minWidth: 220 }}
      >
        {label}
      </td>
      {Array.from({ length: daysInMonth }, (_, i) => {
        const n = counts[i] ?? 0;
        const dow = new Date(year, month - 1, i + 1).getDay();
        const bg = n >= 2 ? 'oklch(54% 0.16 152 / 0.15)' : n === 1 ? 'oklch(60% 0.15 75 / 0.20)' : 'oklch(52% 0.22 18 / 0.12)';
        const color = n >= 2 ? 'oklch(44% 0.16 152)' : n === 1 ? 'oklch(48% 0.15 75)' : 'oklch(42% 0.22 18)';
        return (
          <td key={i} className="w-12 min-w-[48px] p-0.5" style={dayCellStyle(dow)}>
            <div
              className="flex h-[22px] w-full items-center justify-center rounded font-mono text-[10px] font-bold"
              style={{ background: bg, color }}
            >
              {n > 0 ? n : '·'}
            </div>
          </td>
        );
      })}
      {/* summary col spacers */}
      <td colSpan={2} className="border-b border-l border-gray-100 bg-gray-50" />
    </tr>
  );
}
