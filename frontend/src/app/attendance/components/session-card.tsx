'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime, formatHours } from '@/utils/format';
import type { AttendanceSession, MonthlyShift } from '@/types';

// ─── Session status helpers ───────────────────────────────────────────────────

type SessionStatus = 'pending' | 'active' | 'done';

function deriveStatus(session: AttendanceSession | null): SessionStatus {
  if (!session) return 'pending';
  if (session.checkinTime && !session.checkoutTime) return 'active';
  if (session.checkinTime && session.checkoutTime) return 'done';
  return 'pending';
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SessionCardProps {
  /** Live session data — null when not yet checked in */
  session: AttendanceSession | null;
  /** Shift definition for this card (always present) */
  shift: MonthlyShift;
  /** Whether any action (check-in or check-out) is in flight for THIS card */
  actionLoading: boolean;
  /** Called when user clicks Check In on this card */
  onCheckIn: () => void;
  /** Called when user clicks Check Out on this card */
  onCheckOut: () => void;
  /** When true, show "Ca hiện tại" badge next to status pill */
  isRecommended?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SessionCard({
  session,
  shift,
  actionLoading,
  onCheckIn,
  onCheckOut,
  isRecommended = false,
}: SessionCardProps) {
  const { t } = useTranslation();
  const status = deriveStatus(session);

  const borderClass =
    status === 'active'
      ? 'border-indigo-200 bg-indigo-50'
      : status === 'done'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-gray-200 bg-white';

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${borderClass}`}>

      {/* Header: shift name + time range + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{shift.shiftName}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {shift.startTime} — {shift.endTime}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isRecommended && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-700">
              Ca hiện tại
            </span>
          )}
          <StatusPill status={status} t={t} />
        </div>
      </div>

      {/* Times grid (shown only once there's a session) */}
      {session && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-emerald-500 mb-0.5">
              {t('attendance.checkinLabel')}
            </p>
            <p className="font-medium text-gray-700">
              {session.checkinTime ? formatDateTime(session.checkinTime).split(' ')[1] : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-orange-500 mb-0.5">
              {t('attendance.checkoutLabel')}
            </p>
            <p className="font-medium text-gray-700">
              {session.checkoutTime ? formatDateTime(session.checkoutTime).split(' ')[1] : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Working hours (done sessions) */}
      {status === 'done' && session?.workingHours != null && (
        <p className="text-xs font-medium text-emerald-700">
          {t('attendance.workingHoursLabel')}: {formatHours(session.workingHours)}
          {session.isOvertime && (
            <span className="ml-2 text-indigo-600">
              +OT {Number(session.overtimeHours ?? 0).toFixed(1)}h
            </span>
          )}
        </p>
      )}

      {/* Status badges (late / early-out) */}
      {session && (
        <div className="flex flex-wrap gap-1">
          {session.isLate && <Badge label={t('attendance.late')} variant="danger" />}
          {session.isEarlyOut && <Badge label={t('attendance.earlyOut')} variant="warning" />}
          {session.isOvertime && (
            <Badge
              label={`OT ${Number(session.overtimeHours ?? 0).toFixed(1)}h`}
              variant="info"
            />
          )}
        </div>
      )}

      {/* Action button */}
      {status === 'pending' && (
        <Button
          size="sm"
          className="w-full"
          loading={actionLoading}
          onClick={onCheckIn}
        >
          {t('attendance.checkIn')}
        </Button>
      )}
      {status === 'active' && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          loading={actionLoading}
          onClick={onCheckOut}
        >
          {t('attendance.checkOut')}
        </Button>
      )}
    </div>
  );
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({
  status,
  t,
}: {
  status: SessionStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string) => string;
}) {
  const map: Record<SessionStatus, { label: string; cls: string }> = {
    pending: {
      label: t('attendance.sessionPending'),
      cls: 'bg-gray-100 text-gray-500',
    },
    active: {
      label: t('attendance.sessionActive'),
      cls: 'bg-indigo-100 text-indigo-700',
    },
    done: {
      label: t('attendance.sessionDone'),
      cls: 'bg-emerald-100 text-emerald-700',
    },
  };
  const { label, cls } = map[status];
  return (
    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}
