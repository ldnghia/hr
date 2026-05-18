'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Table, type Column } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { statusBadge } from '@/components/ui/Badge';
import { EmployeeAvatar } from './EmployeeAvatar';
import { formatDate, capitalise } from '@/utils/format';
import type { Employee, PaginatedResponse } from '@/types';

interface EmployeeTableProps {
  result: PaginatedResponse<Employee> | null;
  loading: boolean;
  page: number;
  limit: number;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (p: number) => void;
}

export function EmployeeTable({
  result,
  loading,
  page,
  limit,
  onNext,
  onPrev,
  onGoTo,
}: EmployeeTableProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const COLUMNS: Column<Employee>[] = [
    {
      key: 'employee',
      header: t('employee.colEmployee'),
      headerClassName: 'min-w-[180px]',
      render: (emp) => (
        <div className="flex items-center gap-3 min-w-0">
          <EmployeeAvatar name={emp.fullName ?? 'U'} size="md" />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{emp.fullName}</p>
            <p className="text-xs text-gray-400 truncate">{emp.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'code',
      header: t('employee.colCode'),
      render: (emp) => (
        <span className="font-mono text-xs text-gray-500">{emp.code ?? '—'}</span>
      ),
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
    },
    {
      key: 'department',
      header: t('employee.colDepartment'),
      render: (emp) => <span className="text-gray-600">{emp.department?.name ?? '—'}</span>,
    },
    {
      key: 'position',
      header: t('employee.colPosition'),
      render: (emp) => <span className="text-gray-600">{emp.position?.name ?? '—'}</span>,
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
    },
    {
      key: 'role',
      header: t('employee.colRole'),
      render: (emp) => (
        <span className="text-gray-600">{capitalise(emp.role ?? '')}</span>
      ),
      headerClassName: 'hidden lg:table-cell',
      cellClassName: 'hidden lg:table-cell',
    },
    {
      key: 'status',
      header: t('employee.colStatus'),
      render: (emp) => statusBadge(emp.status),
    },
    {
      key: 'joined',
      header: t('employee.colJoined'),
      render: (emp) => (
        <span className="text-gray-500">{formatDate(emp.joinDate)}</span>
      ),
      headerClassName: 'hidden xl:table-cell',
      cellClassName: 'hidden xl:table-cell',
    },
  ];

  return (
    <>
      <Table<Employee>
        columns={COLUMNS}
        data={result?.data ?? []}
        loading={loading}
        keyExtractor={(emp) => emp.id}
        emptyMessage={t('employee.noEmployeesFound')}
        onRowClick={(emp) => router.push(`/employees/${emp.id}`)}
      />
      {result && result.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={result.meta.totalPages}
          total={result.meta.total}
          limit={limit}
          onPrev={onPrev}
          onNext={onNext}
          onGoTo={onGoTo}
        />
      )}
    </>
  );
}
