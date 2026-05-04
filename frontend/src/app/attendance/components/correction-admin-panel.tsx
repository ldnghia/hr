'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { correctionService, type CorrectionRequest } from '@/services/attendance-correction.service';
import { CorrectionReviewModal } from './correction-review-modal';
import { formatDateTime } from '@/utils/format';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

const STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'common.pending',
  approved: 'common.approved',
  rejected: 'common.rejected',
  cancelled: 'common.cancelled',
};

export function CorrectionAdminPanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CorrectionRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState<CorrectionRequest | null>(null);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await correctionService.list({ page, limit: 15, status: statusFilter || undefined });
      const payload = res.data ?? {};
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
    } catch {
      setError(t('attendance.failedToLoadCorrections'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, t]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const statusLabels: Record<string, string> = {
    '': t('common.all'),
    'pending': t('common.pending'),
    'approved': t('common.approved'),
    'rejected': t('common.rejected'),
    'cancelled': t('common.cancelled'),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">{t('attendance.filterByStatus')}</span>
        {['', 'pending', 'approved', 'rejected', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {statusLabels[s]}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}
      {error && <Alert variant="error" message={error} />}

      {!loading && !error && items.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">{t('attendance.noCorrectionRequestsFound')}</p>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t('common.employee')}</th>
                <th className="px-4 py-3 text-left">{t('common.date')}</th>
                <th className="px-4 py-3 text-left">{t('attendance.requestedCheckin')}</th>
                <th className="px-4 py-3 text-left">{t('attendance.requestedCheckout')}</th>
                <th className="px-4 py-3 text-left">{t('common.status')}</th>
                <th className="px-4 py-3 text-left">{t('attendance.submitted')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{req.employee?.fullName ?? '—'}</p>
                    <p className="text-xs text-gray-400">{req.employee?.code}</p>
                  </td>
                  <td className="px-4 py-3">{req.attendance?.date?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {req.requestedCheckinTime ? formatDateTime(req.requestedCheckinTime) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {req.requestedCheckoutTime ? formatDateTime(req.requestedCheckoutTime) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={t(STATUS_LABEL_KEY[req.status] ?? `common.${req.status}`, req.status)} variant={STATUS_VARIANT[req.status] ?? 'neutral'} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(req.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" onClick={() => setReviewing(req)}>
                      {req.status === 'pending' ? t('attendance.review') : t('attendance.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 15 && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{t('common.total_count', { n: total })}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('attendance.prev')}</Button>
            <Button variant="secondary" size="sm" disabled={page * 15 >= total} onClick={() => setPage((p) => p + 1)}>{t('attendance.next')}</Button>
          </div>
        </div>
      )}

      {reviewing && (
        <CorrectionReviewModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onSuccess={fetchList}
        />
      )}
    </div>
  );
}
