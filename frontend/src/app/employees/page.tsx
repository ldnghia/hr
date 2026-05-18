'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { employeeService } from '@/services/employee.service';
import { organizationService } from '@/services/organization.service';
import { usePagination } from '@/hooks/usePagination';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrHR } from '@/utils/rbac';
import { EmployeeTable } from '@/modules/employee/EmployeeTable';
import { CreateEmployeeModal } from '@/modules/employee/CreateEmployeeModal';
import { useTranslation } from 'react-i18next';
import type { Employee, Department, PaginatedResponse } from '@/types';

export default function EmployeesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const role = user?.role;
  const canSeeAll = isAdminOrHR(role);
  const isManager = role === 'manager';

  // Employees see only their own profile — redirect immediately
  useEffect(() => {
    if (user && role === 'employee') {
      router.replace(`/employees/${user.id}`);
    }
  }, [user, role, router]);

  const [result, setResult] = useState<PaginatedResponse<Employee> | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { page, limit, goTo, next, prev, reset } = usePagination(20);

  // Load department list once for filter dropdown
  useEffect(() => {
    organizationService.departments().then(setDepartments).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    if (role === 'employee') return; // handled by redirect above

    setLoading(true);
    try {
      const data = await employeeService.list({
        page,
        limit,
        search: search || undefined,
        status: statusFilter || undefined,
        departmentId: departmentId || undefined,
        // Manager scoping is handled server-side (auto dept filter)
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, departmentId, user, role, isManager]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    reset();
  }

  // Don't render the full page for employees (they'll be redirected)
  if (role === 'employee') return null;

  const pageTitle = isManager ? t('employee.myTeam') : t('employee.title');

  return (
    <AppShell title={pageTitle}>
      <div className="space-y-5">

        {/* Manager context banner */}
        {isManager && (
          <Alert
            variant="info"
            message={t('employee.managerBanner')}
          />
        )}

        {/* Filters + Add button */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <form onSubmit={handleSearch} className="space-y-3">
            {/* Row 1: search + add button */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label={t('common.search')}
                  placeholder={t('employee.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {canSeeAll && (
                <Button type="button" onClick={() => setShowModal(true)} className="shrink-0">
                  <span className="hidden sm:inline">{t('employee.addEmployee')}</span>
                  <span className="sm:hidden">+</span>
                </Button>
              )}
            </div>

            {/* Row 2: selects + action buttons */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 w-full sm:w-auto">
                <label className="block text-sm font-medium text-gray-700">{t('common.status')}</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); reset(); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t('common.all')}</option>
                  <option value="probation">{t('status.probation')}</option>
                  <option value="official">{t('status.official')}</option>
                  <option value="resigned">{t('status.resigned')}</option>
                  <option value="inactive">{t('status.inactive')}</option>
                </select>
              </div>

              {/* Department filter — only for admin/hr */}
              {canSeeAll && departments.length > 0 && (
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="block text-sm font-medium text-gray-700">{t('employee.colDepartment')}</label>
                  <select
                    value={departmentId}
                    onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : ''); reset(); }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{t('common.all')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" variant="secondary">{t('common.search')}</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setSearch(''); setStatusFilter(''); setDepartmentId(''); reset(); }}
                >
                  {t('common.clear')}
                </Button>
              </div>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 sm:px-6 py-4">
            <h3 className="text-base font-semibold text-gray-800">
              {isManager ? t('employee.yourTeam') : t('employee.allEmployees')}
              {result && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({result.meta.total} {t('common.total')})
                </span>
              )}
            </h3>
          </div>
          <EmployeeTable
            result={result}
            loading={loading}
            page={page}
            limit={limit}
            onNext={next}
            onPrev={prev}
            onGoTo={goTo}
          />
        </div>
      </div>

      {canSeeAll && (
        <CreateEmployeeModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}
