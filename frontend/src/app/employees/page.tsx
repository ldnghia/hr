'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { FacetedFilter, FilterResetButton } from '@/components/ui/FacetedFilter';
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
  const { page, limit, goTo, setLimit, reset } = usePagination(20);

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
      <div className="space-y-4">

        {/* Manager context banner */}
        {isManager && (
          <Alert
            variant="info"
            message={t('employee.managerBanner')}
          />
        )}

        {/* Toolbar: filters (left) + actions (right) — reference: booking list toolbar */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-full sm:w-64">
                <Input
                  placeholder={t('employee.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <FacetedFilter
                label={t('common.status')}
                options={[
                  { value: 'probation', label: t('status.probation') },
                  { value: 'official',  label: t('status.official') },
                  { value: 'resigned',  label: t('status.resigned') },
                  { value: 'inactive',  label: t('status.inactive') },
                ]}
                selected={statusFilter ? [statusFilter] : []}
                onChange={(v) => { setStatusFilter(v[0] ?? ''); reset(); }}
                singleSelect
                showSearch={false}
                clearLabel={t('common.clear')}
                emptyLabel={t('common.noResults', 'Không có kết quả')}
                panelWidth={180}
              />

              {/* Department filter — only for admin/hr */}
              {canSeeAll && departments.length > 0 && (
                <FacetedFilter
                  label={t('employee.colDepartment')}
                  options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                  selected={departmentId ? [String(departmentId)] : []}
                  onChange={(v) => { setDepartmentId(v[0] ? Number(v[0]) : ''); reset(); }}
                  singleSelect
                  clearLabel={t('common.clear')}
                  emptyLabel={t('common.noResults', 'Không có kết quả')}
                  panelWidth={240}
                />
              )}

              <FilterResetButton
                show={!!search || !!statusFilter || !!departmentId}
                onClick={() => { setSearch(''); setStatusFilter(''); setDepartmentId(''); reset(); }}
                label={t('common.clear')}
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => load()}
                disabled={loading}
                aria-label={t('common.refresh', 'Làm mới')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCw size={15} className={loading ? 'animate-spin' : undefined} />
              </button>
              {canSeeAll && (
                <Button type="button" onClick={() => setShowModal(true)} className="shrink-0">
                  <span className="hidden sm:inline">{t('employee.addEmployee')}</span>
                  <span className="sm:hidden">+</span>
                </Button>
              )}
            </div>
        </form>

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
            onPageChange={(p, pageSize) => {
              if (pageSize !== limit) setLimit(pageSize);
              else goTo(p);
            }}
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
