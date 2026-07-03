'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { statusBadge } from '@/components/ui/Badge';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { status?: number; data?: { message?: string | string[] } }; message?: string };
  const raw = e?.response?.data?.message;
  if (raw) return Array.isArray(raw) ? raw[0] : raw;
  return e?.message ?? fallback;
}

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

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-800">{t('leave.adminBalances')}</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('employee.searchPlaceholder')}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {accrueMsg && <span className="text-sm text-emerald-600">{accrueMsg}</span>}
          <Button size="sm" variant="secondary" loading={accruing} onClick={runAccrual}>
            {t('leave.runAccrual')}
          </Button>
        </div>
      </div>

      {error && <div className="px-6 py-3"><Alert variant="error" message={error} /></div>}

      {loading ? (
        <PageSpinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3 text-left whitespace-nowrap min-w-[160px]">{t('leave.colEmployee')}</th>
                <th className="px-6 py-3 text-center whitespace-nowrap">{t('leave.colTotal')}</th>
                <th className="px-6 py-3 text-center whitespace-nowrap">{t('leave.colUsed')}</th>
                <th className="px-6 py-3 text-center whitespace-nowrap">{t('leave.colRemaining')}</th>
                <th className="px-6 py-3 text-left whitespace-nowrap hidden md:table-cell">{t('leave.colUsage')}</th>
                <th className="px-6 py-3 whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRows.map((row) => {
                const total = Number(row.total);
                const used = Number(row.used);
                const remaining = Number(row.remaining);
                const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                return (
                  <tr key={row.employeeId} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-800">{row.employee?.fullName ?? `#${row.employeeId}`}</p>
                      <p className="text-xs text-gray-400">{row.employee?.department?.name} · {row.employee?.code}</p>
                    </td>
                    <td className="px-6 py-3 text-center font-medium">{total}</td>
                    <td className="px-6 py-3 text-center text-amber-600">{used}</td>
                    <td className="px-6 py-3 text-center font-semibold text-emerald-600">{remaining}</td>
                    <td className="px-6 py-3 w-32 hidden md:table-cell">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={['h-full rounded-full', pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'].join(' ')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{pct}%</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => openEdit(row)} className="text-xs text-indigo-600 hover:underline">
                        {t('leave.setBalance')}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                    {t('leave.noBalanceRecords')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Set balance modal */}
      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title={t('leave.setBalanceTitle', { name: editRow?.employee?.fullName ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditRow(null)}>{t('common.cancel')}</Button>
            <Button size="sm" loading={saving} onClick={saveEdit}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {saveError && <Alert variant="error" message={saveError} />}
          <Input
            label={t('leave.totalLeaveDays')}
            type="number"
            min="0"
            step="0.5"
            value={editTotal}
            onChange={(e) => setEditTotal(e.target.value)}
          />
          <Input
            label={t('leave.reasonOptional')}
            placeholder={t('leave.reasonPlaceholderAccrual')}
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
          />
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
  const [statusFilter, setStatusFilter] = useState('pending');
  const [pageError, setPageError] = useState('');
  const { page, limit, next, prev, reset, goTo } = usePagination(20);

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
        ? await leaveService.listAll({ page, limit, status: statusFilter || undefined })
        : await leaveService.listMy({ page, limit, status: statusFilter || undefined });
      setResult(leaveData);
    } catch (err) {
      setPageError(extractError(err, 'Failed to load leave data'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, isAdminOrHR]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPending(); }, [loadPending]);

  async function handleApprove(id: number) {
    try {
      await leaveService.approve(id);
      load();
      loadPending();
    } catch (err) {
      setPageError(extractError(err, 'Approve failed'));
    }
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

  async function handleCancel(id: number) {
    try {
      await leaveService.cancel(id);
      load();
    } catch (err) {
      setPageError(extractError(err, 'Cancel failed'));
    }
  }

  return (
    <AppShell title={t('leave.title')}>
      <div className="space-y-5">

        {pageError && <Alert variant="error" message={pageError} />}

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
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-800">{t('leave.allRequests')}</h3>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); reset(); }}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('leave.allStatus')}</option>
                <option value="pending">{t('common.pending')}</option>
                <option value="approved">{t('common.approved')}</option>
                <option value="rejected">{t('common.rejected')}</option>
                <option value="cancelled">{t('common.cancelled')}</option>
              </select>
            </div>
            <Button onClick={() => setShowModal(true)} size="sm">{t('leave.requestLeave')}</Button>
          </div>

          {loading ? (
            <PageSpinner />
          ) : (
            <>
              {/* ── Mobile card list ── */}
              <div className="sm:hidden divide-y divide-gray-50">
                {result?.data.length === 0 && (
                  <p className="px-5 py-10 text-center text-sm text-gray-400">{t('leave.noRequests')}</p>
                )}
                {result?.data.map((leave) => (
                  <div
                    key={leave.id}
                    onClick={() => router.push(`/leave/${leave.id}`)}
                    className="px-4 py-3 space-y-2 cursor-pointer active:bg-gray-50"
                  >
                    {/* Row 1: employee (admin/HR only) */}
                    {isAdminOrHR && (
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{leave.employee?.fullName ?? `#${leave.employeeId}`}</p>
                        <p className="text-xs text-gray-400">{leave.employee?.department?.name}</p>
                      </div>
                    )}
                    {/* Row 2: type + status + days */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(leave.type)}
                        {statusBadge(leave.status)}
                        {leave.isHalfDay && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700">
                            ½ ngày
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-indigo-600 text-sm">{leave.days}d</span>
                    </div>
                    {/* Row 3: date range */}
                    <p className="text-xs text-gray-600">
                      {formatDate(leave.fromDate)}
                      {leave.fromDate !== leave.toDate && (
                        <> <span className="text-gray-400">→</span> {formatDate(leave.toDate)}</>
                      )}
                    </p>
                    {/* Row 4: actions */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {canActOnLeaveRequest(leave, user) && (
                        <>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => handleApprove(leave.id)}>
                            {t('leave.approve')}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setRejectTarget(leave)}>
                            {t('leave.reject')}
                          </Button>
                        </>
                      )}
                      {/* Pending: employee cancel own; Approved: admin only */}
                      {((leave.status === 'pending' && leave.employeeId === user?.id) ||
                        (leave.status === 'approved' && user?.role === 'admin')) && (
                        <Button size="sm" variant="ghost" onClick={() => handleCancel(leave.id)}>
                          {t('leave.cancel')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Desktop table ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                    <tr>
                      {isAdminOrHR && <th className="px-6 py-3 text-left whitespace-nowrap min-w-[160px]">{t('leave.colEmployee')}</th>}
                      <th className="px-6 py-3 text-left whitespace-nowrap">{t('leave.colType')}</th>
                      <th className="px-6 py-3 text-left whitespace-nowrap hidden lg:table-cell">Lý do</th>
                      <th className="px-6 py-3 text-left whitespace-nowrap">{t('leave.colDateRange')}</th>
                      <th className="px-6 py-3 text-left whitespace-nowrap hidden md:table-cell">{t('leave.colDays')}</th>
                      <th className="px-6 py-3 text-left whitespace-nowrap">{t('leave.colStatus')}</th>
                      <th className="px-6 py-3 text-left whitespace-nowrap hidden lg:table-cell">{t('leave.colStep')}</th>
                      <th className="px-6 py-3 text-left whitespace-nowrap">{t('leave.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result?.data.map((leave) => (
                      <tr
                        key={leave.id}
                        onClick={() => router.push(`/leave/${leave.id}`)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        {isAdminOrHR && (
                          <td className="px-6 py-3">
                            <p className="font-medium text-gray-900">{leave.employee?.fullName ?? `#${leave.employeeId}`}</p>
                            <p className="text-xs text-gray-400">{leave.employee?.department?.name}</p>
                          </td>
                        )}
                        <td className="px-6 py-3">{statusBadge(leave.type)}</td>
                        <td className="px-6 py-3 text-gray-600 max-w-[200px] hidden lg:table-cell">
                          <p className="truncate text-sm" title={leave.reason}>{leave.reason || <span className="text-gray-300">—</span>}</p>
                        </td>
                        <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(leave.fromDate)}
                          {leave.fromDate !== leave.toDate && (
                            <> <span className="text-gray-400">→</span> {formatDate(leave.toDate)}</>
                          )}
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-800 hidden md:table-cell">{leave.days}</td>
                        <td className="px-6 py-3">{statusBadge(leave.status)}</td>
                        <td className="px-6 py-3 text-gray-500 text-xs hidden lg:table-cell">{leave.currentStep}/2</td>
                        <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            {canActOnLeaveRequest(leave, user) && (
                              <>
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => handleApprove(leave.id)}>
                                  {t('leave.approve')}
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => setRejectTarget(leave)}>
                                  {t('leave.reject')}
                                </Button>
                              </>
                            )}
                            {/* Pending: employee cancel own; Approved: admin only */}
                            {((leave.status === 'pending' && leave.employeeId === user?.id) ||
                              (leave.status === 'approved' && user?.role === 'admin')) && (
                              <Button size="sm" variant="ghost" onClick={() => handleCancel(leave.id)}>
                                {t('leave.cancel')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {result?.data.length === 0 && (
                      <tr>
                        <td colSpan={isAdminOrHR ? 8 : 7} className="px-6 py-12 text-center text-sm text-gray-400" style={{ display: 'table-cell' }}>
                          {t('leave.noRequests')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Always show pagination */}
              {result && (
                <Pagination
                  page={page}
                  totalPages={result.meta.totalPages || 1}
                  total={result.meta.total}
                  limit={limit}
                  onPrev={prev}
                  onNext={next}
                  onGoTo={goTo}
                />
              )}
            </>
          )}
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
    </AppShell>
  );
}
