'use client';

import type { AttendanceSession } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  sessions: AttendanceSession[];
  /** shiftId currently being checked out */
  loadingShiftId: number | null;
  onCheckOut: (shiftId: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UnclosedSessionWarningBanner({ sessions, loadingShiftId, onCheckOut }: Props) {
  if (sessions.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Bạn có {sessions.length} ca chưa checkout
        </p>
      </div>

      <div className="space-y-2">
        {sessions.map((s) => {
          const shiftId = s.shiftId ?? 0;
          const isLoading = loadingShiftId === shiftId;
          return (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-100 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {s.shift?.name ?? `Ca #${shiftId}`}
                </p>
                <p className="text-xs text-gray-400">
                  {fmtDate(s.date)} · vào {s.checkinTime ? fmtTime(s.checkinTime) : '—'}
                </p>
              </div>
              <button
                onClick={() => onCheckOut(shiftId)}
                disabled={isLoading || loadingShiftId !== null}
                className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white
                           hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? '...' : 'Checkout'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
