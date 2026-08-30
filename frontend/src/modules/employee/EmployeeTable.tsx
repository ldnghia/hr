'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Button as AntButton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '@/components/antd/data-table';
import { statusBadge } from '@/components/ui/Badge';
import { EmployeeAvatar } from './EmployeeAvatar';
import { formatDate, capitalise } from '@/utils/format';
import type { Employee, PaginatedResponse } from '@/types';

interface EmployeeTableProps {
  result: PaginatedResponse<Employee> | null;
  loading: boolean;
  page: number;
  limit: number;
  onPageChange: (page: number, pageSize: number) => void;
}

export function EmployeeTable({
  result,
  loading,
  page,
  limit,
  onPageChange,
}: EmployeeTableProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const columns: ColumnsType<Employee> = [
    {
      title: t('employee.colEmployee'),
      key: 'employee',
      render: (_, emp) => (
        <div className="flex min-w-0 items-center gap-3">
          <EmployeeAvatar name={emp.fullName ?? 'U'} size="md" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-gray-900">
              {emp.fullName}
              {emp.attendanceExempt && (
                <span
                  title="Ưu tiên — miễn chấm công"
                  className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                >
                  Ưu tiên
                </span>
              )}
            </p>
            <p className="truncate text-xs text-gray-400">{emp.email}</p>
          </div>
        </div>
      ),
    },
    {
      title: t('employee.colCode'),
      key: 'code',
      render: (_, emp) => <span className="font-mono text-xs text-gray-500">{emp.code ?? '—'}</span>,
      responsive: ['sm'],
    },
    {
      title: t('employee.colDepartment'),
      key: 'department',
      render: (_, emp) => <span className="text-gray-600">{emp.department?.name ?? '—'}</span>,
    },
    {
      title: t('employee.colPosition'),
      key: 'position',
      render: (_, emp) => <span className="text-gray-600">{emp.position?.name ?? '—'}</span>,
      responsive: ['md'],
    },
    {
      title: t('employee.colRole'),
      key: 'role',
      render: (_, emp) => <span className="text-gray-600">{capitalise(emp.role ?? '')}</span>,
      responsive: ['lg'],
    },
    {
      title: t('employee.colStatus'),
      key: 'status',
      render: (_, emp) => statusBadge(emp.status),
    },
    {
      title: t('employee.colJoined'),
      key: 'joined',
      render: (_, emp) => <span className="text-gray-500">{formatDate(emp.joinDate)}</span>,
      responsive: ['xl'],
    },
    {
      title: '',
      key: 'actions',
      align: 'center',
      width: 72,
      render: (_, emp) => (
        <AntButton
          size="small"
          color="blue"
          variant="outlined"
          icon={<Pencil size={14} />}
          aria-label={t('common.edit')}
          title={t('common.edit')}
          onClick={(e) => { e.stopPropagation(); router.push(`/employees/${emp.id}`); }}
        />
      ),
    },
  ];

  return (
    <DataTable<Employee>
      bordered
      columns={columns}
      dataSource={result?.data ?? []}
      loading={loading}
      rowKey="id"
      page={page}
      pageSize={limit}
      total={result?.meta.total ?? 0}
      onPageChange={onPageChange}
      pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
      onRow={(emp) => ({
        onClick: () => router.push(`/employees/${emp.id}`),
        className: 'cursor-pointer',
      })}
      locale={{ emptyText: t('employee.noEmployeesFound') }}
      scroll={{ x: 'max-content' }}
    />
  );
}
