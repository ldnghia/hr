'use client';

import { useTranslation } from 'react-i18next';
import type { AttendanceSession } from '@/types';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DailySummaryCardProps {
  sessions: AttendanceSession[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DailySummaryCard({ sessions }: DailySummaryCardProps) {
  const { t } = useTranslation();

  // Only count sessions that have completed (have both check-in and check-out)
  const doneSessions = sessions.filter((s) => s.checkinTime && s.checkoutTime);

  if (doneSessions.length === 0) return null;

  const totalHours = doneSessions.reduce((sum, s) => {
    return sum + Number(s.workingHours ?? 0);
  }, 0);

  const totalOT = doneSessions.reduce((sum, s) => {
    return sum + (s.isOvertime ? Number(s.overtimeHours ?? 0) : 0);
  }, 0);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400 mb-3">
        {t('attendance.dailySummary')}
      </p>

      <div className="flex items-end gap-6">
        <div>
          <p className="text-2xl font-bold text-indigo-700 tabular-nums">
            {totalHours.toFixed(1)}h
          </p>
          <p className="text-xs text-indigo-500 mt-0.5">
            {t('attendance.workingHoursLabel')}
          </p>
        </div>

        {totalOT > 0 && (
          <div>
            <p className="text-xl font-bold text-violet-600 tabular-nums">
              +{totalOT.toFixed(1)}h
            </p>
            <p className="text-xs text-violet-400 mt-0.5">{t('attendance.overtime')}</p>
          </div>
        )}

        <div className="ml-auto text-right">
          <p className="text-lg font-semibold text-indigo-600 tabular-nums">
            {doneSessions.length}
          </p>
          <p className="text-xs text-indigo-400 mt-0.5">
            {t('attendance.sessionsDone')}
          </p>
        </div>
      </div>
    </div>
  );
}
