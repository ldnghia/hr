'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { statusBadge } from '@/components/ui/Badge';
import { leaveService } from '@/services/leave.service';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, formatDateTime, capitalise } from '@/utils/format';
import { LeaveTimeline } from '@/modules/leave/LeaveTimeline';
import { RejectModal } from '@/modules/leave/RejectModal';
import { canActOnLeaveRequest } from '@/modules/leave/leave-permissions';
import { useTranslation } from 'react-i18next';
import type { LeaveRequest } from '@/types';

export default function LeaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [leave, setLeave] = useState<LeaveRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReject, setShowReject] = useState(false);

  const canAct = leave ? canActOnLeaveRequest(leave, user) : false;
  const isOwner = leave?.employeeId === user?.id;
  const canCancel =
    !!leave &&
    ((leave.status === 'pending' && isOwner) ||
      (leave.status === 'approved' && user?.role === 'admin'));

  function extractApiError(err: unknown, fallback: string): string {
    const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
    const raw = e?.response?.data?.message;
    if (raw) return Array.isArray(raw) ? raw[0] : raw;
    return e?.message ?? fallback;
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await leaveService.get(Number(id));
      setLeave(data);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load leave request.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove() {
    if (!leave) return;
    setActionLoading(true);
    setError('');
    try {
      await leaveService.approve(leave.id);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Approval failed. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(comments: string) {
    if (!leave) return;
    setError('');
    try {
      await leaveService.reject(leave.id, comments || undefined);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Rejection failed. Please try again.'));
    }
  }

  async function handleCancel() {
    if (!leave) return;
    setActionLoading(true);
    setError('');
    try {
      await leaveService.cancel(leave.id);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Cancel failed. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <AppShell title={t('leave.leaveRequestDetail')}><PageSpinner /></AppShell>;

  if (!leave && error) {
    return (
      <AppShell title={t('leave.leaveRequestDetail')}>
        <div className="p-6 space-y-4">
          <Alert message={error} />
          <Button variant="secondary" onClick={() => router.back()}>{t('common.goBack')}</Button>
        </div>
      </AppShell>
    );
  }

  if (!leave) return null;

  return (
    <AppShell title={t('leave.leaveRequestDetail')}>
      <div className="space-y-5 max-w-3xl">
        {error && <Alert message={error} />}

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('leave.backToLeave')}
        </button>

        {/* Header card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-gray-900">
                  {t('leave.leaveRequestTitle', { id: leave.id })}
                </h2>
                {statusBadge(leave.status)}
                {statusBadge(leave.type)}
              </div>
              <p className="text-sm text-gray-500">
                {t('leave.submittedOn', { date: formatDateTime(leave.createdAt) })}
              </p>
            </div>

            {/* Action buttons */}
            {(canAct || canCancel) && (
              <div className="flex gap-2">
                {canAct && (
                  <>
                    <Button
                      onClick={handleApprove}
                      loading={actionLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    >
                      {t('leave.approve')}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setShowReject(true)}
                      disabled={actionLoading}
                    >
                      {t('leave.reject')}
                    </Button>
                  </>
                )}
                {canCancel && (
                  <Button
                    variant="secondary"
                    onClick={handleCancel}
                    loading={actionLoading}
                  >
                    {t('leave.cancelRequest')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Request info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('leave.requestDetails')}
            </h3>
            <dl className="space-y-3">
              <Row label={t('leave.leaveType')} value={capitalise(leave.type)} />
              <Row label={t('common.from')} value={formatDate(leave.fromDate)} />
              <Row label={t('common.to')} value={formatDate(leave.toDate)} />
              <Row
                label={t('leave.duration')}
                value={t('leave.durationDays', { n: leave.days })}
              />
              <Row label={t('common.status')} value={statusBadge(leave.status)} />
              <Row label={t('leave.currentStep')} value={`${leave.currentStep} / 2`} />
            </dl>
          </div>

          {/* Employee info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('leave.requestEmployee')}
            </h3>
            {leave.employee ? (
              <dl className="space-y-3">
                <Row label={t('common.name')} value={leave.employee.fullName} />
                <Row label={t('common.email')} value={leave.employee.email} />
                <Row label={t('common.code')} value={
                  <span className="font-mono">{leave.employee.code}</span>
                } />
                <Row
                  label={t('common.department')}
                  value={leave.employee.department?.name}
                />
                <Row
                  label={t('common.manager')}
                  value={leave.employee.manager?.fullName}
                />
              </dl>
            ) : (
              <p className="text-sm text-gray-400">Employee #{leave.employeeId}</p>
            )}
          </div>
        </div>

        {/* Reason */}
        {leave.reason && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('common.reason')}
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">{leave.reason}</p>
          </div>
        )}

        {/* Approval timeline */}
        <LeaveTimeline
          approvals={leave.approvals}
          currentStep={leave.currentStep}
        />
      </div>

      <RejectModal
        open={showReject}
        onClose={() => setShowReject(false)}
        onConfirm={handleReject}
        employeeName={leave.employee?.fullName}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-gray-800 text-right">{value ?? '—'}</dd>
    </div>
  );
}
