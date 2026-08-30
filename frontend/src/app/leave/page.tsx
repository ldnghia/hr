'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnsType } from 'antd/es/table';
import { Button, Select, Input, Modal, Alert, Tooltip } from 'antd';
import { Plus, CheckCircle, XCircle, Ban, Download } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable } from '@/components/antd/data-table';
import { StatusTag } from '@/components/antd/status-tag';
import { ReloadButton } from '@/components/antd/reload-button';
import { leaveService } from '@/services/leave.service';
import { usePagination } from '@/hooks/usePagination';
import { formatDate, formatMonthYear } from '@/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { CreateLeaveModal } from '@/modules/leave/CreateLeaveModal';
import { RejectModal } from '@/modules/leave/RejectModal';
import { PendingApprovals } from '@/modules/leave/PendingApprovals';
import { canActOnLeaveRequest } from '@/modules/leave/leave-permissions';
import { useTranslation } from 'react-i18next';
import type {
  LeaveRequest,
  PaginatedResponse,
  LeaveBalance,
} from '@/types';

const { TextArea } = Input;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { status?: number; data?: { message?: string | string[] } }; message?: string };
  const raw = e?.response?.data?.message;
  if (raw) return Array.isArray(raw) ? raw[0] : raw;
  return e?.message ?? fallback;
}

const EXPORT_MIN_YEAR = 2026;

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

const TYPE_VARIANT: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  annual: 'default',
  sick: 'warning',
  compensatory: 'success',
  unpaid: 'default',
};

// ─── Admin balance panel ──────────────────────────────────────────────────────

interface AdminBalanceRow extends LeaveBalance {
  employee: { id: number; fullName?: string | null; code?: string | null; department?: { name?: string | null } | null };
}

function AdminBalancePanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminBalanceRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accruing, setAccruing] = useState(false);
  const [accrueMsg, setAccrueMsg] = useState('');

  // Set balance modal
  const [editRow, setEditRow] = useState<AdminBalanceRow | null>(null);
  const [editTotal, setEditTotal] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leaveService.allBalances();
      setRows(data as AdminBalanceRow[]);
    } catch (err) {
      setError(extractError(err, 'Failed to load balances'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredRows = rows.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      row.employee?.fullName?.toLowerCase().includes(q) ||
      row.employee?.code?.toLowerCase().includes(q) ||
      row.employee?.department?.name?.toLowerCase().includes(q)
    );
  });

  async function runAccrual() {
    setAccruing(true);
    setAccrueMsg('');
    try {
      const res = await leaveService.accrue({ daysPerEmployee: 1.0, note: `Cộng phép thủ công — ${formatMonthYear()}` });
      setAccrueMsg(t('leave.accrualSuccess', { n: res.processed }));
      await load();
    } catch (err) {
      setAccrueMsg(extractError(err, 'Accrual failed'));
    } finally {
      setAccruing(false);
    }
  }

  function openEdit(row: AdminBalanceRow) {
    setEditRow(row);
    setEditTotal(String(Number(row.total)));
    setEditReason('');
    setSaveError('');
  }

  async function saveEdit() {
    if (!editRow) return;
    const total = parseFloat(editTotal);
    if (isNaN(total) || total < 0) { setSaveError(t('validation.validNumberRequired')); return; }
    setSaving(true);
    setSaveError('');
    try {
      await leaveService.setBalance(editRow.employeeId, { total, reason: editReason || undefined });
      setEditRow(null);
      await load();
    } catch (err) {
      setSaveError(extractError(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<AdminBalanceRow> = useMemo(() => [
    {
      title: t('leave.colEmployee'),
      key: 'employee',
      width: 200,
      render: (_, row) => (
        <div className="whitespace-nowrap">
          <p className="font-medium text-gray-800">{row.employee?.fullName ?? `#${row.employeeId}`}</p>
          <p className="text-xs text-gray-400">{row.employee?.department?.name} · {row.employee?.code}</p>
        </div>
      ),
    },
    {
      title: t('leave.colTotal'),
      key: 'total',
      width: 100,
      align: 'center',
      render: (_, row) => <span className="font-medium">{Number(row.total)}</span>,
    },
    {
      title: t('leave.colUsed'),
      key: 'used',
      width: 100,
      align: 'center',
      render: (_, row) => <span className="text-amber-600">{Number(row.used)}</span>,
    },
    {
      title: t('leave.colRemaining'),
      key: 'remaining',
      width: 110,
      align: 'center',
      render: (_, row) => <span className="font-semibold text-emerald-600">{Number(row.remaining)}</span>,
    },
    {
      title: t('leave.colUsage'),
      key: 'usage',
      width: 140,
      render: (_, row) => {
        const total = Number(row.total);
        const used = Number(row.used);
        const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
        return (
          <div className="w-28">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={['h-full rounded-full', pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'].join(' ')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{pct}%</span>
          </div>
        );
      },
    },
    {
      title: '',
      key: 'action',
      width: 90,
      align: 'center',
      fixed: 'right',
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => openEdit(row)}>
          {t('leave.setBalance')}
        </Button>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-800">{t('leave.adminBalances')}</h3>
        <div className="flex items-center gap-2">
          <Input.Search
            allowClear
            placeholder={t('employee.searchPlaceholder')}
            className="w-56"
            onSearch={setSearch}
            onChange={(e) => { if (!e.target.value) setSearch(''); }}
          />
        </div>
      </div>

      {error && <Alert type="error" title={error} />}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <DataTable
          rowKey="employeeId"
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: t('leave.noBalanceRecords') }}
        />
      </div>

      {/* Set balance modal */}
      <Modal
        open={!!editRow}
        onCancel={() => setEditRow(null)}
        title={t('leave.setBalanceTitle', { name: editRow?.employee?.fullName ?? '' })}
        onOk={saveEdit}
        confirmLoading={saving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <div className="space-y-4">
          {saveError && <Alert type="error" title={saveError} />}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('leave.totalLeaveDays')}</label>
            <Input type="number" min={0} step={0.5} value={editTotal} onChange={(e) => setEditTotal(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('leave.reasonOptional')}</label>
            <Input placeholder={t('leave.reasonPlaceholderAccrual')} value={editReason} onChange={(e) => setEditReason(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [result, setResult] = useState<PaginatedResponse<LeaveRequest> | null>(null);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>('pending');
  const [search, setSearch] = useState('');
  const [pageError, setPageError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportYear, setExportYear] = useState(Math.max(EXPORT_MIN_YEAR, new Date().getFullYear()));
  const { page, limit, reset, goTo } = usePagination(10);

  const isApprover = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'manager';
  const isAdminOrHR = user?.role === 'admin' || user?.role === 'hr';

  const loadPending = useCallback(async () => {
    if (!isApprover) return;
    setPendingLoading(true);
    try {
      const data =
        user?.role === 'manager'
          ? await leaveService.pendingForManager()
          : await leaveService.pendingForHR();
      setPending(data);
    } catch {
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  }, [isApprover, user?.role]);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const leaveData = isAdminOrHR
        ? await leaveService.listAll({ page, limit, status: statusFilter || undefined, search: search || undefined })
        : await leaveService.listMy({ page, limit, status: statusFilter || undefined });
      setResult(leaveData);
    } catch (err) {
      setPageError(extractError(err, 'Failed to load leave data'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, search, isAdminOrHR]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPending(); }, [loadPending]);

  function handleApprove(id: number) {
    Modal.confirm({
      title: t('leave.approveConfirm', 'Bạn có chắc muốn phê duyệt yêu cầu nghỉ phép này?'),
      okText: t('common.confirm', 'Xác nhận'),
      cancelText: t('common.cancel', 'Hủy'),
      onOk: async () => {
        try {
          await leaveService.approve(id);
          load();
          loadPending();
        } catch (err) {
          setPageError(extractError(err, 'Approve failed'));
        }
      },
    });
  }

  async function handleReject(comments: string) {
    if (!rejectTarget) return;
    try {
      await leaveService.reject(rejectTarget.id, comments || undefined);
      setRejectTarget(null);
      load();
      loadPending();
    } catch (err) {
      setPageError(extractError(err, 'Reject failed'));
    }
  }

  async function handleExportDetail(year: number) {
    setExporting(true);
    try {
      const res = await leaveService.exportDetail({ year });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bao_Cao_Nghi_Phep_Chi_Tiet_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportModalOpen(false);
    } catch (err) {
      setPageError(extractError(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  function handleCancel(id: number) {
    Modal.confirm({
      title: t('leave.cancelConfirm', 'Bạn có chắc muốn hủy yêu cầu nghỉ phép này?'),
      okText: t('common.confirm', 'Xác nhận'),
      cancelText: t('common.cancel', 'Hủy'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await leaveService.cancel(id);
          load();
        } catch (err) {
          setPageError(extractError(err, 'Cancel failed'));
        }
      },
    });
  }

  const columns: ColumnsType<LeaveRequest> = useMemo(() => {
    const cols: ColumnsType<LeaveRequest> = [];
    if (isAdminOrHR) {
      cols.push({
        title: t('leave.colEmployee'),
        key: 'employee',
        width: 180,
        render: (_, leave) => (
          <div className="whitespace-nowrap">
            <p className="font-medium text-gray-900">{leave.employee?.fullName ?? `#${leave.employeeId}`}</p>
            <p className="text-xs text-gray-400">{leave.employee?.department?.name}</p>
          </div>
        ),
      });
    }
    cols.push(
      {
        title: t('leave.colType'),
        dataIndex: 'type',
        key: 'type',
        width: 130,
        render: (type: string) => <StatusTag variant={TYPE_VARIANT[type] ?? 'default'} label={t(`leave.${type}`, type)} />,
      },
      {
        title: 'Lý do',
        dataIndex: 'reason',
        key: 'reason',
        width: 220,
        render: (reason: string) =>
          reason ? (
            <Tooltip title={reason}>
              <p className="max-w-[220px] truncate text-[13px] leading-5">
                {reason}
              </p>
            </Tooltip>
          ) : (
            <span className="text-gray-300">—</span>
          ),
      },
      {
        title: t('leave.colDateRange'),
        key: 'dateRange',
        width: 180,
        render: (_, leave) => (
          <span className="whitespace-nowrap">
            {formatDate(leave.fromDate)}
            {leave.fromDate !== leave.toDate && <> <span className="text-gray-400">→</span> {formatDate(leave.toDate)}</>}
            {leave.isHalfDay && <span className="ml-1 text-xs text-purple-600">(½)</span>}
          </span>
        ),
      },
      {
        title: t('leave.colDays'),
        dataIndex: 'days',
        key: 'days',
        width: 90,
        align: 'center',
        render: (days: number) => <span className="font-medium text-gray-800">{days}</span>,
      },
      {
        title: t('leave.colStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (status: string) => <StatusTag variant={STATUS_VARIANT[status] ?? 'default'} label={t(`common.${status}`, status)} />,
      },
      {
        title: t('leave.colStep'),
        key: 'step',
        width: 80,
        render: (_, leave) => <span className="text-xs text-gray-500">{leave.currentStep}/2</span>,
      },
      {
        title: '',
        key: 'action',
        width: 90,
        align: 'center',
        fixed: 'right',
        render: (_, leave) => (
          <div className="flex items-center justify-center gap-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            {canActOnLeaveRequest(leave, user) && (
              <>
                <button
                  type="button"
                  title={t('leave.approve')}
                  onClick={() => handleApprove(leave.id)}
                  className="rounded p-1 text-green-500 hover:bg-green-50 transition-colors cursor-pointer"
                >
                  <CheckCircle size={15} />
                </button>
                <button
                  type="button"
                  title={t('leave.reject')}
                  onClick={() => setRejectTarget(leave)}
                  className="rounded p-1 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <XCircle size={15} />
                </button>
              </>
            )}
            {((leave.status === 'pending' && leave.employeeId === user?.id) ||
              (leave.status === 'approved' && user?.role === 'admin')) && (
              <button
                type="button"
                title={t('leave.cancel')}
                onClick={() => handleCancel(leave.id)}
                className="rounded p-1 text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
              >
                <Ban size={15} />
              </button>
            )}
          </div>
        ),
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminOrHR, user, t]);

  const newRequestButton = (
    <Button type="primary" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>
      {t('leave.requestLeave')}
    </Button>
  );

  return (
    <AppShell title={t('leave.title')}>
      <div className="space-y-5">

        {pageError && <Alert type="error" title={pageError} />}

        {/* Pending approvals */}
        {isApprover && (
          <PendingApprovals
            requests={pending}
            loading={pendingLoading}
            onApprove={handleApprove}
            onReject={(req) => setRejectTarget(req)}
          />
        )}

        {/* Leave requests table */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="shrink-0 whitespace-nowrap text-base font-semibold text-gray-800">{t('leave.allRequests')}</h3>
              <Select
                value={statusFilter}
                allowClear
                placeholder={t('leave.allStatus')}
                className="w-40"
                onChange={(val) => { setStatusFilter(val); reset(); }}
                options={[
                  { value: 'pending', label: t('common.pending') },
                  { value: 'approved', label: t('common.approved') },
                  { value: 'rejected', label: t('common.rejected') },
                  { value: 'cancelled', label: t('common.cancelled') },
                ]}
              />
              {isAdminOrHR && (
                <Input.Search
                  allowClear
                  placeholder={t('employee.searchPlaceholder')}
                  className="w-56"
                  onSearch={(val) => { setSearch(val); reset(); }}
                  onChange={(e) => { if (!e.target.value) { setSearch(''); reset(); } }}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <ReloadButton onClick={load} loading={loading} />
              {isAdminOrHR && (
                <Button
                  icon={<Download size={14} />}
                  onClick={() => setExportModalOpen(true)}
                >
                  {t('leave.exportDetail')}
                </Button>
              )}
              {newRequestButton}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <DataTable
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={result?.data ?? []}
              page={page}
              pageSize={limit}
              total={result?.meta.total ?? 0}
              onPageChange={goTo}
              scroll={{ x: 'max-content' }}
              onRow={(leave) => ({
                onClick: () => router.push(`/leave/${leave.id}`),
                className: 'cursor-pointer',
              })}
              locale={{ emptyText: t('leave.noRequests') }}
            />
          </div>
        </div>

        {/* Admin: all balances */}
        {isAdminOrHR && <AdminBalancePanel />}

      </div>

      <CreateLeaveModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); load(); }}
        workingMode={user?.workingMode}
      />

      <RejectModal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        employeeName={rejectTarget?.employee?.fullName}
      />

      <Modal
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        title={t('leave.exportDetail')}
        onOk={() => handleExportDetail(exportYear)}
        confirmLoading={exporting}
        okText={t('common.export')}
        cancelText={t('common.cancel')}
      >
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600">{t('leave.exportYear')}</label>
          <Select
            value={exportYear}
            onChange={setExportYear}
            className="w-full"
            options={Array.from(
              { length: Math.max(1, new Date().getFullYear() - EXPORT_MIN_YEAR + 1) },
              (_, i) => EXPORT_MIN_YEAR + i,
            ).map((y) => ({ value: y, label: y }))}
          />
        </div>
      </Modal>
    </AppShell>
  );
}
