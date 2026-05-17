'use client';

import { useEffect, useRef } from 'react';
import type { ShiftSummary } from '@/types';

const OFF_TYPES = [
  { code: 'OFF', label: 'OFF',  desc: 'Nghỉ full ngày' },
  { code: 'AL',  label: 'Phép', desc: 'Nghỉ phép năm'  },
  { code: 'SL',  label: 'Ốm',  desc: 'Nghỉ ốm'        },
  { code: 'H',   label: 'Lễ',  desc: 'Nghỉ lễ'        },
] as const;

const OFF_STYLES: Record<string, string> = {
  OFF: 'bg-gray-100 text-gray-600 border-gray-200',
  AL:  'bg-orange-50 text-orange-700 border-orange-200',
  SL:  'bg-pink-50 text-pink-700 border-pink-200',
  H:   'bg-red-50 text-red-700 border-red-200',
};

const OFF_ACTIVE: Record<string, string> = {
  OFF: 'bg-gray-200 text-gray-800 border-gray-400 font-bold',
  AL:  'bg-orange-100 text-orange-800 border-orange-400 font-bold',
  SL:  'bg-pink-100 text-pink-800 border-pink-400 font-bold',
  H:   'bg-red-100 text-red-800 border-red-400 font-bold',
};

type ShiftColor = { dot: string; bg: string; text: string; border: string };

interface Props {
  shifts: ShiftSummary[];
  /** Color keyed by shiftId — ensures consistency with the cell pill colors */
  shiftColorMap: Map<number, ShiftColor>;
  activeShiftIds: number[];
  activeOffType: string | null;
  onToggleShift: (id: number) => void;
  onSetOff: (code: string) => void;
  onClear: () => void;
  onClose: () => void;
  alignRight?: boolean;
}

export function ScheduleCellEditor({
  shifts, shiftColorMap, activeShiftIds, activeOffType,
  onToggleShift, onSetOff, onClear, onClose, alignRight,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className={[
        'absolute top-full mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-xl z-50 p-3',
        alignRight ? 'right-0' : 'left-0',
      ].join(' ')}
    >
      {/* Shift toggles */}
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Phân ca</p>
      <div className="space-y-1 mb-3">
        {shifts.map((s) => {
          const colors = shiftColorMap.get(s.id) ?? { dot: '#6B7280', bg: '#F9FAFB', text: '#374151', border: '#E5E7EB' };
          const on = activeShiftIds.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => onToggleShift(s.id)}
              className={[
                'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-all',
                on ? 'font-semibold' : 'text-gray-800',
              ].join(' ')}
              style={on ? { background: colors.bg, color: colors.text, borderColor: colors.border }
                       : { borderColor: '#E5E7EB' }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.dot }} />
              <span className="flex-1 text-left">{s.name}</span>
              <span className="text-[11px] tabular-nums opacity-60">{s.startTime.slice(0,5)}–{s.endTime.slice(0,5)}</span>
            </button>
          );
        })}
      </div>

      {/* Off type buttons */}
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Nghỉ (full ngày)</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {OFF_TYPES.map((o) => {
          const on = activeOffType === o.code;
          return (
            <button
              key={o.code}
              onClick={() => onSetOff(o.code)}
              title={o.desc}
              className={['rounded-md border px-2.5 py-1 text-xs font-semibold transition-all', on ? OFF_ACTIVE[o.code] : OFF_STYLES[o.code]].join(' ')}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 pt-2 flex justify-end">
        <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-700 hover:underline px-1 py-0.5">
          Xoá phân công
        </button>
      </div>
    </div>
  );
}
