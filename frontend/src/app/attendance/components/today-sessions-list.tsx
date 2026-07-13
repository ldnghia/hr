'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SessionCard } from './session-card';
import type { AttendanceSession, MonthlyShift } from '@/types';

// ─── Shift auto-detection ─────────────────────────────────────────────────────

/** Convert "HH:MM" to total minutes */
function hhmmToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns the shiftId most likely to be the current shift based on current time.
 * - Window: [startMins - 120, endMins] (allow 2h early check-in)
 * - Cross-day shifts: end < start → add 1440 to end
 * - If no match: returns the shift with startTime closest to now (next upcoming)
 */
export function getRecommendedShiftId(shifts: MonthlyShift[]): number | null {
  if (shifts.length === 0) return null;

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const startMinsOf = (s: MonthlyShift) => hhmmToMins(s.startTime);
  const endMinsOf = (s: MonthlyShift) => hhmmToMins(s.endTime);

  // Find shifts whose window covers current time (2h early entry allowed)
  const matched = shifts.filter((s) => {
    const start = startMinsOf(s) - 120;
    const rawEnd = endMinsOf(s);
    const isCrossDay = rawEnd < startMinsOf(s);
    const end = isCrossDay ? rawEnd + 1440 : rawEnd;

    let cur = currentMins;
    // For cross-day shifts, if we're in early hours before start, normalize
    if (isCrossDay && cur < startMinsOf(s)) cur += 1440;

    return cur >= start && cur <= end;
  });

  if (matched.length > 0) {
    // Among matched, pick earliest start
    return matched.reduce((best, s) =>
      startMinsOf(s) < startMinsOf(best) ? s : best
    ).shiftId;
  }

  // No match: pick shift with startTime closest to now (next upcoming)
  return shifts.reduce((best, s) => {
    const d1 = Math.abs(startMinsOf(best) - currentMins);
    const d2 = Math.abs(startMinsOf(s) - currentMins);
    return d2 < d1 ? s : best;
  }).shiftId;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface TodaySessionsListProps {
  sessions: AttendanceSession[];
  shifts: MonthlyShift[];
  sessionsLoading: boolean;
  shiftsLoading: boolean;
  /** shiftId of the card currently performing an action */
  loadingShiftId: number | null;
  onCheckIn: (shiftId: number) => void;
  onCheckOut: (shiftId: number) => void;
  /** Returns true if check-out may proceed (reason not required or already filled).
   *  Called before opening the confirm modal; when false, the caller has already
   *  focused/highlighted the reason box, so the modal must not open. */
  canCheckOut?: () => boolean;
  /** Whether the employee is in SHIFT working mode */
  isShiftEmployee?: boolean;
  /** Called when user taps "Chấm công ngay" on the auto-detect banner */
  onAutoCheckIn?: (shiftId: number) => void;
  /** Unclosed sessions from previous days (cross-day shift support) */
  unclosedSessions?: AttendanceSession[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TodaySessionsList({
  sessions,
  shifts,
  sessionsLoading,
  shiftsLoading,
  loadingShiftId,
  onCheckIn,
  onCheckOut,
  canCheckOut,
  isShiftEmployee = false,
  onAutoCheckIn,
  unclosedSessions = [],
}: TodaySessionsListProps) {
  const { t } = useTranslation();

  const isLoading = sessionsLoading || shiftsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-400">
        <Spinner className="h-4 w-4 text-indigo-500" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (shifts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        {t('attendance.noShiftsThisMonth')}
      </p>
    );
  }

  // Determine recommended shift for SHIFT employees
  const recommendedShiftId = isShiftEmployee ? getRecommendedShiftId(shifts) : null;

  // Merge today's sessions with unclosed cross-day sessions from yesterday
  // so session cards show the correct state for active night shifts
  const allSessions = [
    ...sessions,
    // Include unclosed sessions only if not already in sessions (by shiftId)
    ...unclosedSessions.filter((u) => !sessions.some((s) => s.shiftId === u.shiftId)),
  ];

  // Only show auto-detect banner if recommended shift is not already active
  // (includes cross-day sessions from yesterday)
  const recommendedShift = recommendedShiftId != null
    ? shifts.find((s) => s.shiftId === recommendedShiftId)
    : null;
  const recommendedSession = recommendedShiftId != null
    ? allSessions.find((s) => s.shiftId === recommendedShiftId) ?? null
    : null;
  const showAutoBanner = isShiftEmployee
    && recommendedShift != null
    && !recommendedSession?.checkinTime;

  return (
    <div className="space-y-3">
      {/* Auto-detect banner for SHIFT employees — hidden when shift already active */}
      {showAutoBanner && recommendedShift && (
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
            Ca hiện tại được tự động nhận diện
          </p>
          <p className="text-sm font-semibold text-gray-900">
            {recommendedShift.shiftName}
            <span className="ml-2 text-xs font-normal text-gray-500">
              {recommendedShift.startTime} – {recommendedShift.endTime}
            </span>
          </p>
          <Button
            size="sm"
            className="w-full"
            loading={loadingShiftId === recommendedShift.shiftId}
            onClick={() => (onAutoCheckIn ?? onCheckIn)(recommendedShift.shiftId)}
          >
            Chấm công ngay
          </Button>
        </div>
      )}

      {shifts.map((shift) => {
        // Match from merged sessions (today + cross-day unclosed from yesterday)
        const session = allSessions.find((s) => s.shiftId === shift.shiftId) ?? null;

        return (
          <SessionCard
            key={shift.shiftId}
            shift={shift}
            session={session}
            actionLoading={loadingShiftId === shift.shiftId}
            isRecommended={shift.shiftId === recommendedShiftId}
            onCheckIn={() => onCheckIn(shift.shiftId)}
            onCheckOut={() => onCheckOut(shift.shiftId)}
            canCheckOut={canCheckOut}
          />
        );
      })}
    </div>
  );
}
