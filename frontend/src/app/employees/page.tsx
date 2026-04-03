'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { employeeService } from '@/services/employee.service';
import { usePagination } from '@/hooks/usePagination';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrHR } from '@/utils/rbac';
import { EmployeeTable } from '@/modules/employee/EmployeeTable';
import { CreateEmployeeModal } from '@/modules/employee/CreateEmployeeModal';
import type { Employee, PaginatedResponse } from '@/types';

export default function EmployeesPage() {
  const { user } = useAuth();
  const router = useRouter();

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
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { page, limit, goTo, next, prev, reset } = usePagination(20);

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
        // Manager: restrict to direct reports
        managerId: isManager ? user.id : undefined,
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, user, role, isManager]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    reset();
  }

  // Don't render the full page for employees (they'll be redirected)
  if (role === 'employee') return null;

  const pageTitle = isManager ? 'My Team' : 'Employees';

  return (
    <AppShell title={pageTitle}>
      <div className="space-y-5">

        {/* Manager context banner */}
        {isManager && (
          <Alert
            variant="info"
            message={`Showing your direct reports only. Switch to HR view to see all employees.`}
          />
        )}

        {/* Filters + Add button */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Input
                label="Search"
                placeholder="Name, email or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); reset(); }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All</option>
                <option value="probation">Probation</option>
                <option value="official">Official</option>
                <option value="resigned">Resigned</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <Button type="submit" variant="secondary">Search</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setSearch(''); setStatusFilter(''); reset(); }}
            >
              Clear
            </Button>
            {canSeeAll && (
              <div className="ml-auto">
                <Button type="button" onClick={() => setShowModal(true)}>
                  + Add Employee
                </Button>
              </div>
            )}
          </form>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h3 className="text-base font-semibold text-gray-800">
              {isManager ? 'Your Team' : 'All Employees'}
              {result && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({result.meta.total} total)
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
