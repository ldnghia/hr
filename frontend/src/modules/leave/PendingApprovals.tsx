'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { statusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatDate } from '@/utils/format';
import type { LeaveRequest } from '@/types';

interface PendingApprovalsProps {
  requests: LeaveRequest[];
  loading: boolean;
  onApprove: (id: number) => void;
  onReject: (request: LeaveRequest) => void;
}

export function PendingApprovals({
  requests,
  loading,
  onApprove,
  onReject,
}: PendingApprovalsProps) {
  const { t } = useTranslation();
  const router = useRouter();

  if (!loading && requests.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
      <div className="flex items-center gap-2 border-b border-amber-200 px-6 py-4">
        <span className="flex h-2 w-2 rounded-full bg-amber-500" />
        <h3 className="text-sm font-semibold text-amber-800">
          {t('leave.pendingApprovals')}
          {!loading && (
            <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
              {requests.length}
            </span>
          )}
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="divide-y divide-amber-100">
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 cursor-pointer hover:bg-amber-100/40 transition-colors"
              onClick={() => router.push(`/leave/${req.id}`)}
            >
              {/* Employee info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  {req.employee?.fullName?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {req.employee?.fullName ?? `Employee #${req.employeeId}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {req.employee?.department?.name ?? '—'}
                  </p>
                </div>
              </div>

              {/* Leave info + reason */}
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  {statusBadge(req.type)}
                  <span>
                    {formatDate(req.fromDate)}
                    {req.fromDate !== req.toDate && <> → {formatDate(req.toDate)}</>}
                  </span>
                  <span className="font-medium text-gray-800">
                    {req.days} {t('common.day')}
                  </span>
                  <span className="text-xs text-gray-400">
                    {t('common.step')} {req.currentStep}/2
                  </span>
                </div>
                {req.reason && (
                  <p className="text-xs text-gray-500 truncate max-w-sm" title={req.reason}>
                    💬 {req.reason}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  onClick={() => onApprove(req.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                >
                  {t('leave.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onReject(req)}
                >
                  {t('leave.reject')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
