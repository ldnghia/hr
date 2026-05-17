'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { StatCard } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { statusBadge } from '@/components/ui/Badge';
import { employeeService } from '@/services/employee.service';
import { leaveService } from '@/services/leave.service';
import { contractService } from '@/services/contract.service';
import { useTranslation } from 'react-i18next';
import { formatDate, daysUntil } from '@/utils/format';
import type { Employee, LeaveRequest, Contract } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalEmployees: number;
  probationCount: number;
  pendingLeaveCount: number;
  expiringContractCount: number;
}

interface SectionError {
  employees?: string;
  leaves?: string;
  contracts?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extracts a readable error message from an Axios error */
function extractError(err: unknown, fallback: string): string {
  const axiosErr = err as {
    response?: { status?: number; data?: { message?: string | string[] } };
    message?: string;
  };
  const status = axiosErr?.response?.status;
  if (status === 403) return 'Insufficient permissions to view this data.';
  if (status === 404) return 'Resource not found.';
  if (status !== undefined && status >= 500) return 'Server error. Try refreshing.';
  const raw = axiosErr?.response?.data?.message;
  if (raw) return Array.isArray(raw) ? raw[0] : raw;
  return axiosErr?.message ?? fallback;
}

const EXPIRY_WINDOW_DAYS = 30;

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [probationEmployees, setProbationEmployees] = useState<Employee[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [expiringContracts, setExpiringContracts] = useState<Contract[]>([]);
  const [errors, setErrors] = useState<SectionError>({});

  useEffect(() => {
    async function load() {
      console.log('[dashboard] Loading dashboard data…');
      setLoading(true);
      setErrors({});

      const [empResult, probResult, leaveResult, contractResult] =
        await Promise.allSettled([
          // 1. Total employee count (single-row fetch for speed)
          employeeService.list({ limit: 1 }),
          // 2. Employees on probation (up to 5 for the table)
          employeeService.list({ status: 'probation', limit: 5 }),
          // 3. Pending leave requests (up to 5 for the table)
          leaveService.listAll({ status: 'pending', limit: 5 }),
          // 4. Active contracts (filter expiring ≤ 30 days client-side)
          contractService.list({ status: 'active', limit: 30 }),
        ]);

      // ── Process employee stats ─────────────────────────────────────────────
      let totalEmployees = 0;
      if (empResult.status === 'fulfilled') {
        totalEmployees = empResult.value.meta.total;
        console.log('[dashboard] Total employees:', totalEmployees);
      } else {
        const status = (empResult.reason as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          console.warn('[dashboard] Employee count: 403 (restricted role — skipping)');
        } else {
          const msg = extractError(empResult.reason, 'Failed to load employee data.');
          console.error('[dashboard] Failed to fetch employee count:', msg);
          setErrors((prev) => ({ ...prev, employees: msg }));
        }
      }

      // ── Process probation employees ────────────────────────────────────────
      let probationCount = 0;
      if (probResult.status === 'fulfilled') {
        probationCount = probResult.value.meta.total;
        setProbationEmployees(probResult.value.data);
        console.log('[dashboard] Probation employees:', probationCount);
      } else {
        const status = (probResult.reason as { response?: { status?: number } })?.response?.status;
        if (status !== 403) {
          console.error('[dashboard] Failed to fetch probation employees:', extractError(probResult.reason, 'unknown'));
        }
        // Non-critical — don't block the page
      }

      // ── Process pending leaves ─────────────────────────────────────────────
      let pendingLeaveCount = 0;
      if (leaveResult.status === 'fulfilled') {
        pendingLeaveCount = leaveResult.value.meta.total;
        setPendingLeaves(leaveResult.value.data);
        console.log('[dashboard] Pending leave requests:', pendingLeaveCount);
      } else {
        const status = (leaveResult.reason as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          // Expected for employee role
          console.log('[dashboard] Leave endpoint: 403 (employee role — hiding section)');
        } else {
          const msg = extractError(leaveResult.reason, 'Failed to load leave data.');
          console.error('[dashboard] Failed to fetch leave requests:', msg);
          setErrors((prev) => ({ ...prev, leaves: msg }));
        }
      }

      // ── Process contracts ──────────────────────────────────────────────────
      let expiringContractCount = 0;
      if (contractResult.status === 'fulfilled') {
        const allContracts = contractResult.value.data;
        const expiring = allContracts.filter((c) => {
          const days = daysUntil(c.endDate);
          return days !== null && days >= 0 && days <= EXPIRY_WINDOW_DAYS;
        });
        // Sort by soonest expiry first
        expiring.sort((a, b) => {
          return new Date(a.endDate ?? '').getTime() - new Date(b.endDate ?? '').getTime();
        });
        expiringContractCount = expiring.length;
        setExpiringContracts(expiring);
        console.log('[dashboard] Contracts expiring in ≤30 days:', expiringContractCount, expiring);
      } else {
        const status = (contractResult.reason as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          // Expected for manager/employee role
          console.log('[dashboard] Contracts endpoint: 403 (restricted role — hiding section)');
        } else {
          const msg = extractError(contractResult.reason, 'Failed to load contract data.');
          console.error('[dashboard] Failed to fetch contracts:', msg);
          setErrors((prev) => ({ ...prev, contracts: msg }));
        }
      }

      setStats({ totalEmployees, probationCount, pendingLeaveCount, expiringContractCount });
      setLoading(false);
      console.log('[dashboard] Data load complete');
    }

    load();
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppShell title={t('dashboard.title')}>
      {loading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-6">

          {errors.employees && (
            <Alert variant="error" message={errors.employees} />
          )}

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('dashboard.totalEmployees')}
              value={stats?.totalEmployees ?? 0}
              color="indigo"
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <StatCard
              label={t('dashboard.pendingLeave')}
              value={stats?.pendingLeaveCount ?? 0}
              color="amber"
              sub={errors.leaves ? t('dashboard.restricted') : undefined}
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
            />
            <StatCard
              label={t('dashboard.onProbation')}
              value={stats?.probationCount ?? 0}
              color="rose"
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              label={t('dashboard.contractsExpiring', { n: EXPIRY_WINDOW_DAYS })}
              value={stats?.expiringContractCount ?? 0}
              color={stats && stats.expiringContractCount > 0 ? 'rose' : 'emerald'}
              sub={errors.contracts ? t('common.failedToLoad') : undefined}
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            />
          </div>

          {/* ── Main data tables ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Probation Employees */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-4">
                <h3 className="text-base font-semibold text-gray-800">{t('dashboard.employeesOnProbation')}</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {probationEmployees.length > 0 ? (
                  probationEmployees.map((emp) => (
                    <div key={emp.id} className="flex items-center gap-4 px-6 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-600">
                        {emp.fullName?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">{emp.fullName}</p>
                        <p className="truncate text-xs text-gray-400">
                          {emp.department?.name ?? '—'}
                          {emp.probationEndDate
                            ? ` · ${t('dashboard.probationEnds', { date: formatDate(emp.probationEndDate) })}`
                            : ''}
                        </p>
                      </div>
                      {statusBadge(emp.status ?? '')}
                    </div>
                  ))
                ) : (
                  <p className="px-6 py-8 text-center text-sm text-gray-400">
                    {t('dashboard.noProbationEmployees')}
                  </p>
                )}
              </div>
            </div>

            {/* Pending Leave Requests */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-4">
                <h3 className="text-base font-semibold text-gray-800">{t('dashboard.pendingLeaveRequests')}</h3>
              </div>
              {errors.leaves ? (
                <div className="p-4">
                  <Alert variant="warning" message={errors.leaves} />
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {pendingLeaves.length > 0 ? (
                    pendingLeaves.map((leave) => (
                      <div key={leave.id} className="px-6 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {leave.employee?.fullName ?? `Employee #${leave.employeeId}`}
                          </p>
                          {statusBadge(leave.type ?? '')}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {formatDate(leave.fromDate)} → {formatDate(leave.toDate)}
                          {leave.days ? ` · ${leave.days} ${t('common.day')}` : ''}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="px-6 py-8 text-center text-sm text-gray-400">
                      {t('dashboard.noPendingLeave')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Contracts Expiring Soon ── */}
          {errors.contracts ? (
            <Alert variant="error" message={errors.contracts} />
          ) : expiringContracts.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
              <div className="border-b border-amber-100 px-6 py-4">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="text-base font-semibold text-amber-800">
                    {t('dashboard.contractsExpiringTitle', { n: EXPIRY_WINDOW_DAYS })}
                  </h3>
                </div>
              </div>
              <div className="divide-y divide-amber-100">
                {expiringContracts.map((contract) => {
                  const days = daysUntil(contract.endDate);
                  return (
                    <div key={contract.id} className="flex items-center justify-between px-6 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {contract.employee?.fullName ?? `Employee #${contract.employeeId}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t('dashboard.contractType', {
                            type: contract.type ?? t('common.contract'),
                            date: formatDate(contract.endDate),
                          })}
                        </p>
                      </div>
                      <span
                        className={`ml-4 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          days !== null && days <= 7
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {days === 0 ? t('common.today') : days === 1 ? t('common.tomorrow') : t('common.dLeft', { d: days })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

        </div>
      )}
    </AppShell>
  );
}
