'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { Modal } from 'antd';
import { Pencil, XCircle, Loader2, Info } from 'lucide-react';
import { correctionService, type CorrectionRequest } from '@/services/attendance-correction.service';
import { CorrectionEditModal } from './correction-edit-modal';
import { CorrectionFilterBar, type CorrectionDateRange } from './correction-filter-bar';
import { DataTable } from '@/components/antd/data-table';
import { StatusTag } from '@/components/antd/status-tag';
import { ReloadButton } from '@/components/antd/reload-button';
import { formatDateTime } from '@/utils/format';

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

const STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'common.pending',
  approved: 'common.approved',
  rejected: 'common.rejected',
  cancelled: 'common.cancelled',
};

interface Props {
  actionSlot?: React.ReactNode;
}

export function CorrectionRequestList({ actionSlot }: Props = {}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CorrectionRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [editing, setEditing] = useState<CorrectionRequest | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<CorrectionDateRange>(null);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await correctionService.list({
        page,
        limit: pageSize,
        search: search || undefined,
        status,
        from: dateRange?.[0]?.format('YYYY-MM-DD'),
        to: dateRange?.[1]?.format('YYYY-MM-DD'),
      });
      const payload = res.data ?? {};
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
    } catch {
      // table stays empty, no separate error UI per design
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status, dateRange]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleCancel = (id: number) => {
    Modal.confirm({
      title: t('attendance.cancelConfirm'),
      okText: t('common.confirm', 'Xác nhận'),
      cancelText: t('common.cancel', 'Hủy'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setCancelling(id);
          await correctionService.cancel(id);
          fetchList();
        } catch (err: any) {
          Modal.error({ title: err?.response?.data?.message ?? t('attendance.failedToCancel') });
        } finally {
          setCancelling(null);
        }
      },
    });
  };

  const columns: ColumnsType<CorrectionRequest> = useMemo(() => [
    {
      title: t('common.date'),
      dataIndex: ['attendance', 'date'],
      key: 'date',
      width: 110,
      sorter: (a, b) => (a.attendance?.date ?? '').localeCompare(b.attendance?.date ?? ''),
      render: (_, req) => <span className="whitespace-nowrap font-medium">{req.attendance?.date?.slice(0, 10) ?? '—'}</span>,
    },
    {
      title: t('attendance.requestedCheckin'),
      dataIndex: 'requestedCheckinTime',
      key: 'checkin',
      width: 140,
      render: (val) => <span className="whitespace-nowrap">{val ? formatDateTime(val) : '—'}</span>,
    },
    {
      title: t('attendance.requestedCheckout'),
      dataIndex: 'requestedCheckoutTime',
      key: 'checkout',
      width: 140,
      render: (val) => <span className="whitespace-nowrap">{val ? formatDateTime(val) : '—'}</span>,
    },
    {
      title: t('common.reason'),
      dataIndex: 'reason',
      key: 'reason',
      width: 200,
      ellipsis: true,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (statusVal: string) => (
        <StatusTag
          variant={STATUS_VARIANT[statusVal] ?? 'default'}
          label={t(STATUS_LABEL_KEY[statusVal] ?? `common.${statusVal}`, statusVal)}
        />
      ),
    },
    {
      title: t('attendance.submitted'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      render: (val) => <span className="whitespace-nowrap text-gray-500">{formatDateTime(val)}</span>,
    },
    {
      title: '',
      key: 'action',
      width: 90,
      align: 'center',
      fixed: 'right',
      render: (_, req) => (
        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
          {req.status === 'pending' ? (
            <>
              <button
                type="button"
                title={t('common.edit', 'Sửa')}
                onClick={() => setEditing(req)}
                className="rounded p-1 text-indigo-500 hover:bg-indigo-50 transition-colors"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                title={t('attendance.cancelRequest')}
                onClick={() => handleCancel(req.id)}
                disabled={cancelling === req.id}
                className="rounded p-1 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                {cancelling === req.id ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
              </button>
            </>
          ) : (
            <>
              <span className="rounded p-1 text-gray-300">
                <Pencil size={15} />
              </span>
              <span className="rounded p-1 text-gray-300">
                <XCircle size={15} />
              </span>
            </>
          )}
          {req.reviewNote && (
            <span title={req.reviewNote} className="text-gray-400">
              <Info size={15} />
            </span>
          )}
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, cancelling]);

  return (
    <div className="space-y-3">
      <CorrectionFilterBar
        onSearch={(val) => { setPage(1); setSearch(val); }}
        status={status}
        onStatusChange={(val) => { setPage(1); setStatus(val); }}
        dateRange={dateRange}
        onDateRangeChange={(val) => { setPage(1); setDateRange(val); }}
        extra={
          <div className="flex items-center gap-2">
            <ReloadButton onClick={fetchList} loading={loading} />
            {actionSlot}
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <DataTable
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          scroll={{ x: 'max-content' }}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p, ps) => { setPage(p); setPageSize(ps); }}
          locale={{ emptyText: t('attendance.noCorrectionRequests') }}
        />
      </div>

      {editing && (
        <CorrectionEditModal
          request={editing}
          onClose={() => setEditing(null)}
          onSuccess={fetchList}
        />
      )}
    </div>
  );
}
