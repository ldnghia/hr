'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { employeeService } from '@/services/employee.service';
import { leaveService } from '@/services/leave.service';
import { organizationService } from '@/services/organization.service';
import type { Employee, Branch, Department, Position, LeaveBalance } from '@/types';

interface EditEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  employee: Employee;
  leaveBalance?: LeaveBalance | null;
  canEditBalance?: boolean;
  onSuccess: (updated: Employee, newBalance?: LeaveBalance) => void;
}

interface FormState {
  code: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  role: string;
  branchId: string;
  departmentId: string;
  positionId: string;
  managerId: string;
  telegramId: string;
  initialLeaveBalance: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

export function EditEmployeeModal({ open, onClose, employee, leaveBalance, canEditBalance = false, onSuccess }: EditEmployeeModalProps) {
  const { t } = useTranslation();
  const [form, setForm]         = useState<FormState>({ code: '', fullName: '', email: '', phone: '', status: '', role: '', branchId: '', departmentId: '', positionId: '', managerId: '', telegramId: '', initialLeaveBalance: '' });
  const [errors, setErrors]     = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving]     = useState(false);

  const [branches, setBranches]       = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions]     = useState<Position[]>([]);
  const [managers, setManagers]         = useState<Employee[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingPos, setLoadingPos]     = useState(false);
  const [loadingMgr, setLoadingMgr]     = useState(false);
  const [codeWarning, setCodeWarning]   = useState('');
  const codeTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load branches once on open
  useEffect(() => {
    if (!open) return;
    setCodeWarning('');
    setForm({
      code:                employee.code         ?? '',
      fullName:            employee.fullName     ?? '',
      email:               employee.email        ?? '',
      phone:               employee.phone        ?? '',
      status:              employee.status       ?? 'probation',
      role:                employee.role         ?? 'employee',
      branchId:            String(employee.branchId     ?? ''),
      departmentId:        String(employee.departmentId ?? ''),
      positionId:          String(employee.positionId   ?? ''),
      managerId:           String(employee.managerId    ?? ''),
      telegramId:          employee.telegramId         ?? '',
      initialLeaveBalance: String(leaveBalance?.total ?? ''),
    });
    setErrors({});
    setApiError('');

    organizationService.branches().then(setBranches).catch(() => setBranches([]));

    // Load managers (role = manager only, excluding self)
    setLoadingMgr(true);
    employeeService
      .list({ limit: 200, role: 'manager' })
      .then((res) => setManagers((res.data ?? []).filter((e) => e.id !== employee.id)))
      .catch(() => setManagers([]))
      .finally(() => setLoadingMgr(false));
  }, [open, employee]);

  // Load departments when branchId changes
  useEffect(() => {
    if (!open) return;
    const bid = form.branchId ? Number(form.branchId) : undefined;
    setLoadingDepts(true);
    organizationService
      .departments(bid ? { branchId: bid } : undefined)
      .then(setDepartments)
      .catch(() => setDepartments([]))
      .finally(() => setLoadingDepts(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.branchId]);

  // Load positions when departmentId changes
  useEffect(() => {
    if (!open || !form.departmentId) { setPositions([]); return; }
    setLoadingPos(true);
    organizationService
      .positions({ departmentId: Number(form.departmentId) })
      .then(setPositions)
      .catch(() => setPositions([]))
      .finally(() => setLoadingPos(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.departmentId]);

  function set(key: keyof FormState, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Cascade: reset child selects when parent changes
      if (key === 'branchId') { next.departmentId = ''; next.positionId = ''; }
      if (key === 'departmentId') { next.positionId = ''; }
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));

    // Debounce duplicate code check
    if (key === 'code') {
      setCodeWarning('');
      if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
      const trimmed = value.trim();
      if (trimmed && trimmed !== employee.code) {
        codeTimerRef.current = setTimeout(async () => {
          try {
            const res = await employeeService.list({ search: trimmed, limit: 10 });
            const duplicate = (res.data ?? []).find(
              (e) => e.code?.toLowerCase() === trimmed.toLowerCase() && e.id !== employee.id,
            );
            if (duplicate) setCodeWarning(`Mã "${trimmed}" đã được dùng bởi ${duplicate.fullName}`);
          } catch { /* ignore */ }
        }, 500);
      }
    }
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.fullName.trim()) errs.fullName = t('validation.nameRequired');
    if (!form.email.trim()) {
      errs.email = t('validation.emailRequired');
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      errs.email = t('validation.emailInvalid');
    }
    if (form.phone && !/^[+\d\s\-().]{7,20}$/.test(form.phone)) {
      errs.phone = t('validation.phoneInvalid');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    if (codeWarning) return; // block submit if duplicate warning active

    setSaving(true);
    setApiError('');
    try {
      const updated = await employeeService.update(employee.id, {
        code:         form.code.trim() || undefined,
        fullName:     form.fullName.trim(),
        email:        form.email.trim(),
        phone:        form.phone.trim() || undefined,
        status:       form.status,
        role:         form.role,
        branchId:     form.branchId     ? Number(form.branchId)     : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        positionId:   form.positionId   ? Number(form.positionId)   : undefined,
        managerId:    form.managerId    ? Number(form.managerId)     : undefined,
        telegramId:   form.telegramId || undefined,
      });

      let newBalance: LeaveBalance | undefined;
      if (canEditBalance && form.initialLeaveBalance !== '') {
        const newTotal = Number(form.initialLeaveBalance);
        if (newTotal !== leaveBalance?.total) {
          newBalance = await leaveService.setBalance(employee.id, { total: newTotal });
        }
      }

      onSuccess(updated, newBalance);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? t('employee.failedToUpdate')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('employee.editEmployee')} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {apiError && <Alert variant="error" message={apiError} />}

        {/* ── Basic info ─────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('employee.basicInfo')}
          </legend>
          <div>
            <Input
              label={t('employee.employeeCode')}
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
            />
            {codeWarning && (
              <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                <span>⚠</span> {codeWarning}
              </p>
            )}
          </div>
          <Input
            label={t('profile.fullNameRequired')}
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            error={errors.fullName}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('profile.emailRequired')}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <Input
              label={t('common.phone')}
              type="tel"
              placeholder={t('common.optional')}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
            />
          </div>
          <Input
            label={t('employee.telegramLabel')}
            placeholder={t('employee.telegramPlaceholder')}
            value={form.telegramId}
            onChange={(e) => set('telegramId', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('common.status')}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              options={[
                { value: 'probation', label: t('status.probation') },
                { value: 'official',  label: t('status.official') },
                { value: 'resigned',  label: t('status.resigned') },
                { value: 'inactive',  label: t('status.inactive') },
              ]}
            />
            <Select
              label={t('common.role')}
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              options={[
                { value: 'employee', label: t('role.employee') },
                { value: 'manager',  label: t('role.manager') },
                { value: 'hr',       label: t('role.hr') },
                { value: 'admin',    label: t('role.admin') },
              ]}
            />
          </div>
        </fieldset>

        <hr className="border-gray-100" />

        {/* ── Organisation ───────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('employee.organization')}
          </legend>
          <Select
            label={t('common.branch')}
            value={form.branchId}
            onChange={(e) => set('branchId', e.target.value)}
            options={[
              { value: '', label: t('employee.selectBranch') },
              ...branches.map((b) => ({ value: String(b.id), label: b.name })),
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={loadingDepts ? t('employee.loadingDepartment') : t('common.department')}
              value={form.departmentId}
              onChange={(e) => set('departmentId', e.target.value)}
              options={[
                { value: '', label: t('employee.selectDepartment') },
                ...departments.map((d) => ({ value: String(d.id), label: d.name })),
              ]}
            />
            <Select
              label={loadingPos ? t('employee.loadingPosition') : t('common.position')}
              value={form.positionId}
              onChange={(e) => set('positionId', e.target.value)}
              options={[
                { value: '', label: t('employee.selectPosition') },
                ...positions.map((p) => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </div>
          <Select
            label={loadingMgr ? t('employee.loadingManager', 'Đang tải...') : t('employee.directManager', 'Quản lý trực tiếp')}
            value={form.managerId}
            onChange={(e) => set('managerId', e.target.value)}
            options={[
              { value: '', label: t('employee.noManager', '— Không có —') },
              ...managers.map((m) => ({
                value: String(m.id),
                label: m.fullName + (m.code ? ` (${m.code})` : ''),
              })),
            ]}
          />
        </fieldset>

        <hr className="border-gray-100" />

        {/* ── Leave Balance ──────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('employee.leaveBalance')}
          </legend>
          {canEditBalance ? (
            <Input
              label={t('employee.initialLeaveBalance')}
              type="number"
              placeholder="e.g. 12"
              value={form.initialLeaveBalance}
              onChange={(e) => set('initialLeaveBalance', e.target.value)}
            />
          ) : (
            <div>
              <p className="text-xs text-gray-400">{t('employee.initialLeaveBalance')}</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">
                {leaveBalance != null ? leaveBalance.total : '—'}
              </p>
            </div>
          )}
        </fieldset>

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={saving || !!codeWarning}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
