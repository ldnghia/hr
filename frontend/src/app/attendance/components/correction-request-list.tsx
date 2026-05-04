'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { correctionService, type CorrectionRequest } from '@/services/attendance-correction.service';
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

export function CorrectionRequestList() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CorrectionRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await correctionService.list({ page, limit: 10 });
      const payload = res.data ?? {};
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
    } catch {
      setError(t('attendance.failedToLoadCorrections'));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleCancel = async (id: number) => {
    if (!confirm(t('attendance.cancelConfirm'))) return;
    try {
      setCancelling(id);
      await correctionService.cancel(id);
      fetchList();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? t('attendance.failedToCancel'));
    } finally {
      setCancelling(null);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error) return <Alert variant="error" message={error} />;
  if (items.length === 0)
    return <p className="py-8 text-center text-sm text-gray-500">{t('attendance.noCorrectionRequests')}</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t('common.date')}</th>
              <th className="px-4 py-3 text-left">{t('attendance.requestedCheckin')}</th>
              <th className="px-4 py-3 text-left">{t('attendance.requestedCheckout')}</th>
              <th className="px-4 py-3 text-left">{t('common.reason')}</th>
              <th className="px-4 py-3 text-left">{t('common.status')}</th>
              <th className="px-4 py-3 text-left">{t('attendance.submitted')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((req) => (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{req.attendance?.date?.slice(0, 10) ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {req.requestedCheckinTime ? formatDateTime(req.requestedCheckinTime) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {req.requestedCheckoutTime ? formatDateTime(req.requestedCheckoutTime) : '—'}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-600" title={req.reason}>
                  {req.reason}
                </td>
                <td className="px-4 py-3">
                  <Badge label={t(STATUS_LABEL_KEY[req.status] ?? `common.${req.status}`, req.status)} variant={STATUS_VARIANT[req.status] ?? 'neutral'} />
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDateTime(req.createdAt)}</td>
                <td className="px-4 py-3">
                  {req.status === 'pending' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCancel(req.id)}
                      disabled={cancelling === req.id}
                    >
                      {cancelling === req.id ? t('attendance.cancelling') : t('attendance.cancelRequest')}
                    </Button>
                  )}
                  {req.reviewNote && (
                    <span className="ml-1 text-xs text-gray-400" title={req.reviewNote}>
                      {t('attendance.noteInfo')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 10 && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{t('common.total_count', { n: total })}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('attendance.prev')}</Button>
            <Button variant="secondary" size="sm" disabled={page * 10 >= total} onClick={() => setPage((p) => p + 1)}>{t('attendance.next')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
