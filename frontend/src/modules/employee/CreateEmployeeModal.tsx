'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from 'react-i18next';
import { employeeService, type CreateEmployeePayload } from '@/services/employee.service';
import { organizationService } from '@/services/organization.service';
import type { Branch, Department, DepartmentShift, Position, Employee } from '@/types';

interface CreateEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (employee: Employee) => void;
}

interface FormState {
  code: string;
  fullName: string;
  email: string;
  password: string;
  phone: string;
  branchId: string;
  departmentId: string;
  positionId: string;
  managerId: string;
  role: string;
  status: string;
  telegramId: string;
  initialLeaveBalance: string;
  shiftId: string;
}

const INITIAL: FormState = {
  code: '',
  fullName: '',
  email: '',
  password: '',
  phone: '',
  branchId: '',
  departmentId: '',
  positionId: '',
  managerId: '',
  role: 'employee',
  status: 'probation',
  telegramId: '',
  initialLeaveBalance: '12',
  shiftId: '',
};

function toOptions<T extends { id: number; name?: string | null }>(
  items: T[],
): SelectOption[] {
  return items.map((i) => ({ value: i.id, label: i.name ?? String(i.id) }));
}

export function CreateEmployeeModal({
  open,
  onClose,
  onSuccess,
}: CreateEmployeeModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reference data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<DepartmentShift[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  // Load reference data when modal opens
  useEffect(() => {
    if (!open) return;
    setForm(INITIAL);
    setErrors({});
    setApiError('');

    async function fetchRefs() {
      setLoadingRefs(true);
      try {
        const [b, d, p, m] = await Promise.all([
          organizationService.branches(),
          organizationService.departments(),
          organizationService.positions(),
          employeeService.list({ limit: 100, role: 'manager' }).then((r) => r.data),
        ]);
        setBranches(b);
        setDepartments(d);
        setPositions(p);
        setManagers(m);
      } finally {
        setLoadingRefs(false);
      }
    }

    fetchRefs();
  }, [open]);

  // Re-fetch departments when branch changes
  useEffect(() => {
    if (!form.branchId) return;
    organizationService
      .departments({ branchId: Number(form.branchId) })
      .then(setDepartments);
    setForm((f) => ({ ...f, departmentId: '', positionId: '' }));
  }, [form.branchId]);

  // Re-fetch positions when department changes
  useEffect(() => {
    if (!form.departmentId) return;
    organizationService
      .positions({ departmentId: Number(form.departmentId) })
      .then(setPositions);
    setForm((f) => ({ ...f, positionId: '', shiftId: '' }));
  }, [form.departmentId]);

  // Re-fetch shifts when department changes (for SHIFT-type departments)
  useEffect(() => {
    if (!form.departmentId) { setShifts([]); return; }
    organizationService.departmentShifts(Number(form.departmentId)).then(setShifts).catch(() => setShifts([]));
  }, [form.departmentId]);

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Partial<FormState> = {};
    if (!form.code.trim()) errs.code = t('validation.codeRequired');
    if (!form.fullName.trim()) errs.fullName = t('validation.nameRequired');
    if (!form.email.trim()) errs.email = t('validation.emailRequired');
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = t('validation.emailInvalid');
    if (!form.password) errs.password = t('validation.passwordRequired');
    else if (form.password.length < 8) errs.password = t('validation.passwordMinLength');
    if (!form.branchId) errs.branchId = t('validation.branchRequired');
    if (!form.departmentId) errs.departmentId = t('validation.departmentRequired');
    if (!form.positionId) errs.positionId = t('validation.positionRequired');
    // shiftId is optional — assigned later via shift-assignment
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setApiError('');
    setLoading(true);
    try {
      const payload: CreateEmployeePayload = {
        code: form.code,
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        branchId: Number(form.branchId),
        departmentId: Number(form.departmentId),
        positionId: Number(form.positionId),
        managerId: form.managerId ? Number(form.managerId) : undefined,
        role: form.role,
        status: form.status,
        telegramId: form.telegramId || undefined,
        initialLeaveBalance: form.initialLeaveBalance ? Number(form.initialLeaveBalance) : undefined,
        shiftId: form.shiftId ? Number(form.shiftId) : undefined,
      };
      const created = await employeeService.create(payload);
      onSuccess(created);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setApiError(
        Array.isArray(msg) ? msg[0] : (msg ?? t('employee.failedToCreate')),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('employee.addEmployee').replace('+ ', '')}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button form="create-employee-form" type="submit" loading={loading}>
            {t('employee.createEmployee')}
          </Button>
        </>
      }
    >
      {loadingRefs ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-400">
          {t('employee.loadingRefData')}
        </div>
      ) : (
        <form id="create-employee-form" onSubmit={handleSubmit} className="space-y-5">
          {apiError && <Alert message={apiError} />}

          {/* Identity */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('employee.identity')}
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={`${t('employee.employeeCode')} *`}
                placeholder={t('employee.employeeCodePlaceholder')}
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                error={errors.code}
              />
              <Input
                label={`${t('employee.fullName')} *`}
                placeholder={t('employee.fullNamePlaceholder')}
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                error={errors.fullName}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={`${t('common.email')} *`}
                type="email"
                placeholder={t('employee.emailPlaceholder')}
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                error={errors.email}
              />
              <Input
                label={t('common.phone')}
                type="tel"
                placeholder={t('employee.phonePlaceholder')}
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </div>
            <Input
              label={`${t('auth.password')} *`}
              type="password"
              placeholder={t('employee.passwordPlaceholder')}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              error={errors.password}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('employee.telegramLabel')}
                placeholder={t('employee.telegramPlaceholder')}
                value={form.telegramId}
                onChange={(e) => set('telegramId', e.target.value)}
              />
              <Input
                label={t('employee.initialLeaveBalance')}
                type="number"
                placeholder="12"
                value={form.initialLeaveBalance}
                onChange={(e) => set('initialLeaveBalance', e.target.value)}
              />
            </div>
          </fieldset>

          <hr className="border-gray-100" />

          {/* Organization */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('employee.organization')}
            </legend>
            <Select
              label={`${t('common.branch')} *`}
              placeholder={t('employee.selectBranch')}
              value={form.branchId}
              options={toOptions(branches)}
              onChange={(e) => set('branchId', e.target.value)}
              error={errors.branchId}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label={`${t('common.department')} *`}
                placeholder={t('employee.selectDepartment')}
                value={form.departmentId}
                options={toOptions(departments)}
                onChange={(e) => set('departmentId', e.target.value)}
                error={errors.departmentId}
                disabled={!form.branchId}
              />
              <Select
                label={`${t('common.position')} *`}
                placeholder={t('employee.selectPosition')}
                value={form.positionId}
                options={toOptions(positions)}
                onChange={(e) => set('positionId', e.target.value)}
                error={errors.positionId}
                disabled={!form.departmentId}
              />
            </div>
            <Select
              label={t('employee.directManager')}
              placeholder={t('employee.selectManager')}
              value={form.managerId}
              options={managers.map((m) => ({
                value: m.id,
                label: `${m.fullName} (${m.code ?? m.email})`,
              }))}
              onChange={(e) => set('managerId', e.target.value)}
            />
            {shifts.length > 0 && (
              <Select
                label={`${t('employee.workShift')} *`}
                placeholder={t('employee.selectShift')}
                value={form.shiftId}
                options={shifts.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(e) => set('shiftId', e.target.value)}
                error={errors.shiftId}
              />
            )}
          </fieldset>

          <hr className="border-gray-100" />

          {/* Role & Status */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('employee.roleAndStatus')}
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t('common.role')}
                value={form.role}
                options={[
                  { value: 'employee', label: t('role.employee') },
                  { value: 'manager',  label: t('role.manager') },
                  { value: 'hr',       label: t('role.hr') },
                  { value: 'admin',    label: t('role.admin') },
                ]}
                onChange={(e) => set('role', e.target.value)}
              />
              <Select
                label={t('common.status')}
                value={form.status}
                options={[
                  { value: 'probation', label: t('status.probation') },
                  { value: 'official',  label: t('status.official') },
                ]}
                onChange={(e) => set('status', e.target.value)}
              />
            </div>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
