import { useTranslation } from 'react-i18next';
import { statusBadge } from '@/components/ui/Badge';
import { EmployeeAvatar } from './EmployeeAvatar';
import { formatDate, capitalise } from '@/utils/format';
import type { Employee, LeaveBalance } from '@/types';

interface FieldProps {
  label: string;
  value?: React.ReactNode;
}

function Field({ label, value }: FieldProps) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 mb-4 text-sm text-gray-800">{value ?? '—'}</dd>
    </>
  );
}

interface EmployeeProfileProps {
  employee: Employee;
  leaveBalance?: LeaveBalance | null;
}

export function EmployeeProfile({ employee, leaveBalance }: EmployeeProfileProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <EmployeeAvatar name={employee.fullName ?? 'U'} size="xl" />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900 truncate">{employee.fullName}</h2>
          <p className="text-sm text-gray-500">{employee.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {statusBadge(employee.status)}
            {statusBadge(employee.role ?? '')}
            {employee.department && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                {employee.department.name}
              </span>
            )}
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <p className="font-mono text-lg font-bold text-indigo-600">{employee.code}</p>
          <p className="text-xs text-gray-400">{t('profile.employeeCode')}</p>
          <p className="mt-2 text-sm text-gray-600">{formatDate(employee.joinDate)}</p>
          <p className="text-xs text-gray-400">{t('profile.joinDate')}</p>
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Personal info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {t('profile.personalInfo')}
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label={t('profile.fullName')} value={employee.fullName} />
            <Field label={t('common.email')} value={employee.email} />
            <Field label={t('common.phone')} value={employee.phone} />
            <Field label={t('profile.employeeCode')} value={
              <span className="font-mono">{employee.code}</span>
            } />
            <Field label={t('profile.joinDate')} value={formatDate(employee.joinDate)} />
            <Field label={t('common.status')} value={statusBadge(employee.status)} />
            <Field label={t('profile.telegramId')} value={employee.telegramId} />
          </dl>
        </div>

        {/* Work info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {t('profile.workInfo')}
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label={t('common.department')} value={employee.department?.name} />
            <Field label={t('common.position')} value={employee.position?.name} />
            <Field label={t('common.branch')} value={employee.branch?.name} />
            <Field label={t('common.role')} value={capitalise(employee.role ?? '')} />
            <Field
              label={t('profile.initialLeaveBalance')}
              value={leaveBalance != null ? leaveBalance.total : undefined}
            />
            <Field
              label={t('profile.directManager')}
              value={
                employee.manager ? (
                  <div>
                    <p className="font-medium">{employee.manager.fullName}</p>
                    <p className="text-xs text-gray-400">{employee.manager.email}</p>
                  </div>
                ) : undefined
              }
            />
          </dl>
        </div>
      </div>
    </div>
  );
}
