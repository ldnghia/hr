'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { employeeService } from '@/services/employee.service';
import { organizationService } from '@/services/organization.service';
import { capitalise } from '@/utils/format';
import type { Employee, Branch, Department, Position } from '@/types';

interface EditEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  employee: Employee;
  onSuccess: (updated: Employee) => void;
}

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  status: string;
  role: string;
  branchId: string;
  departmentId: string;
  positionId: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

export function EditEmployeeModal({ open, onClose, employee, onSuccess }: EditEmployeeModalProps) {
  const [form, setForm]         = useState<FormState>({ fullName: '', email: '', phone: '', status: '', role: '', branchId: '', departmentId: '', positionId: '' });
  const [errors, setErrors]     = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving]     = useState(false);

  const [branches, setBranches]       = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions]     = useState<Position[]>([]);
  const [loadingDepts, setLoadingDepts]   = useState(false);
  const [loadingPos, setLoadingPos]       = useState(false);

  // Load branches once on open
  useEffect(() => {
    if (!open) return;
    setForm({
      fullName:     employee.fullName     ?? '',
      email:        employee.email        ?? '',
      phone:        employee.phone        ?? '',
      status:       employee.status       ?? 'probation',
      role:         employee.role         ?? 'employee',
      branchId:     String(employee.branchId     ?? ''),
      departmentId: String(employee.departmentId ?? ''),
      positionId:   String(employee.positionId   ?? ''),
    });
    setErrors({});
    setApiError('');

    organizationService.branches().then(setBranches).catch(() => setBranches([]));
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
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.fullName.trim()) errs.fullName = 'Name is required';
    if (!form.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      errs.email = 'Invalid email address';
    }
    if (form.phone && !/^[+\d\s\-().]{7,20}$/.test(form.phone)) {
      errs.phone = 'Invalid phone number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setApiError('');
    try {
      const updated = await employeeService.update(employee.id, {
        fullName:     form.fullName.trim(),
        email:        form.email.trim(),
        phone:        form.phone.trim() || undefined,
        status:       form.status,
        role:         form.role,
        branchId:     form.branchId     ? Number(form.branchId)     : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        positionId:   form.positionId   ? Number(form.positionId)   : undefined,
      });
      onSuccess(updated);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? 'Failed to update employee'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Employee" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {apiError && <Alert variant="error" message={apiError} />}

        {/* ── Basic info ─────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Basic Info
          </legend>
          <Input
            label="Full Name *"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            error={errors.fullName}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email *"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <Input
              label="Phone"
              type="tel"
              placeholder="Optional"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              options={[
                { value: 'probation', label: 'Probation' },
                { value: 'official',  label: 'Official' },
                { value: 'resigned',  label: 'Resigned' },
                { value: 'inactive',  label: 'Inactive' },
              ]}
            />
            <Select
              label="Role"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              options={[
                { value: 'employee', label: 'Employee' },
                { value: 'manager',  label: 'Manager' },
                { value: 'hr',       label: 'HR' },
                { value: 'admin',    label: 'Admin' },
              ]}
            />
          </div>
        </fieldset>

        <hr className="border-gray-100" />

        {/* ── Organisation ───────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Organisation
          </legend>
          <Select
            label="Branch"
            value={form.branchId}
            onChange={(e) => set('branchId', e.target.value)}
            options={[
              { value: '', label: '— Select branch —' },
              ...branches.map((b) => ({ value: String(b.id), label: b.name })),
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={loadingDepts ? 'Department (loading…)' : 'Department'}
              value={form.departmentId}
              onChange={(e) => set('departmentId', e.target.value)}
              options={[
                { value: '', label: '— Select department —' },
                ...departments.map((d) => ({ value: String(d.id), label: d.name })),
              ]}
            />
            <Select
              label={loadingPos ? 'Position (loading…)' : 'Position'}
              value={form.positionId}
              onChange={(e) => set('positionId', e.target.value)}
              options={[
                { value: '', label: '— Select position —' },
                ...positions.map((p) => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </div>
        </fieldset>

        <hr className="border-gray-100" />

        {/* ── Read-only ──────────────────────────────────────── */}
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Read-only
          </legend>
          <div>
            <p className="text-xs text-gray-400">Employee Code</p>
            <p className="mt-0.5 text-sm font-medium text-gray-500">{employee.code ?? '—'}</p>
          </div>
        </fieldset>

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
