'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { organizationService } from '@/services/organization.service';
import type { Branch, Department, DepartmentShift, WorkingType } from '@/types';

// ─── Shift Preview ────────────────────────────────────────────────────────────

const CC_SHIFTS: Array<{ name: string; time: string; note?: string }> = [
  { name: 'Morning',   time: '07:00 → 15:00' },
  { name: 'Afternoon', time: '15:00 → 23:00' },
  { name: 'Night',     time: '23:00 → 07:00', note: 'crosses midnight' },
];

function ShiftPreview({ shifts }: { shifts?: DepartmentShift[] }) {
  const { t } = useTranslation();
  const list = shifts?.length
    ? shifts.map((s) => ({
        name: s.name,
        time: `${s.startTime} → ${s.endTime}`,
        note: s.isCrossDay ? t('department.crossesMidnight') : undefined,
      }))
    : CC_SHIFTS.map((s) => ({ ...s, note: s.note ? t('department.crossesMidnight') : undefined }));

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
        {t('department.shiftSchedule')}
      </p>
      <div className="space-y-1.5">
        {list.map((s) => (
          <div key={s.name} className="flex items-center justify-between text-sm">
            <span className="font-medium text-amber-900">{s.name}</span>
            <span className="font-mono text-amber-700">
              {s.time}
              {s.note && (
                <span className="ml-1.5 rounded bg-amber-200 px-1 text-xs text-amber-800">
                  {s.note}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Working-type badge ───────────────────────────────────────────────────────

function WorkingTypeBadge({ type }: { type: WorkingType }) {
  if (type === 'SHIFT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        SHIFT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
      FIXED
    </span>
  );
}

// ─── Department Modal ─────────────────────────────────────────────────────────

interface DepartmentModalProps {
  open: boolean;
  onClose: () => void;
  department: Department | null;
  branches: Branch[];
  onSuccess: () => void;
}

interface FormState {
  name: string;
  code: string;
  workingType: WorkingType;
  description: string;
  isActive: boolean;
  branchId: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  name: '',
  code: '',
  workingType: 'FIXED',
  description: '',
  isActive: true,
  branchId: '',
};

function DepartmentModal({ open, onClose, department, branches, onSuccess }: DepartmentModalProps) {
  const { t } = useTranslation();
  const isEdit = department !== null;

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApiError('');
    setErrors({});
    if (isEdit && department) {
      setForm({
        name:        department.name,
        code:        department.code,
        workingType: department.workingType,
        description: department.description ?? '',
        isActive:    department.isActive,
        branchId:    department.branchId ? String(department.branchId) : '',
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [open, department, isEdit]);

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim())  errs.name = t('validation.nameRequired');
    if (!form.code.trim())  errs.code = t('validation.codeRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setApiError('');
    try {
      const payload = {
        name:        form.name.trim(),
        code:        form.code.trim().toUpperCase(),
        workingType: form.workingType,
        description: form.description.trim() || undefined,
        isActive:    form.isActive,
        branchId:    form.branchId ? Number(form.branchId) : undefined,
      };
      if (isEdit && department) {
        await organizationService.updateDepartment(department.id, payload);
      } else {
        await organizationService.createDepartment(payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? t('department.failedToSave')));
    } finally {
      setSaving(false);
    }
  }

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t('department.edit') : t('department.add')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && <Alert variant="error" message={apiError} />}

        <Input
          label={t('department.nameLabel')}
          placeholder={t('department.namePlaceholder')}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />

        <Input
          label={`${t('common.code')} *`}
          placeholder={t('department.codePlaceholder')}
          value={form.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
          error={errors.code}
        />

        <Select
          label={t('department.workingTypeLabel')}
          value={form.workingType}
          onChange={(e) => set('workingType', e.target.value as WorkingType)}
          options={[
            { value: 'FIXED', label: t('department.workingTypeFixed') },
            { value: 'SHIFT', label: t('department.workingTypeShift') },
          ]}
        />

        {/* Shift preview when SHIFT is selected */}
        {form.workingType === 'SHIFT' && (
          <div className="space-y-1.5">
            <p className="text-sm text-gray-600">
              {t('department.autoShiftNote')}
            </p>
            <ShiftPreview shifts={isEdit ? department?.shifts : undefined} />
          </div>
        )}

        <Select
          label={`${t('common.branch')} (${t('common.optional')})`}
          value={form.branchId}
          onChange={(e) => set('branchId', e.target.value)}
          placeholder={t('department.noBranch')}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />

        <Input
          label={t('common.description')}
          placeholder={t('department.descriptionPlaceholder')}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          {t('position.active')}
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? t('common.saveChanges') : t('department.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  department: Department | null;
  onSuccess: () => void;
}

function DeleteModal({ open, onClose, department, onSuccess }: DeleteModalProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) setError(''); }, [open]);

  async function handleDelete() {
    if (!department) return;
    setDeleting(true);
    setError('');
    try {
      await organizationService.deleteDepartment(department.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? t('department.failedToDelete')));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('department.delete')}>
      <div className="space-y-4">
        {error && <Alert variant="error" message={error} />}
        <p className="text-sm text-gray-600">
          {t('department.deleteConfirm', { name: department?.name ?? '' })}
          {department?.workingType === 'SHIFT' && (
            <span className="ml-1 text-amber-700">
              (its 3 SHIFT entries will also be removed)
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500">
          {t('department.deleteBlocked')}
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="button"
            variant="danger"
            loading={deleting}
            onClick={handleDelete}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'hr';

  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');

  const [modalOpen, setModalOpen]     = useState(false);
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [selected, setSelected]       = useState<Department | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [depts, branchesList] = await Promise.all([
        organizationService.departments(),
        organizationService.branches(),
      ]);
      setDepartments(depts);
      setBranches(branchesList);
    } catch {
      setError(t('department.failedToSave'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setSelected(null); setModalOpen(true); }
  function openEdit(d: Department) { setSelected(d); setModalOpen(true); }
  function openDelete(d: Department) { setSelected(d); setDeleteOpen(true); }

  if (loading) return <AppShell title={t('department.title')}><PageSpinner /></AppShell>;

  return (
    <AppShell title={t('department.title')}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('department.title')}</h1>
            <p className="text-sm text-gray-500">{departments.length} {t('department.count')}</p>
          </div>
          {canEdit && (
            <Button onClick={openCreate}>{t('department.add')}</Button>
          )}
        </div>

        {error && <Alert variant="error" message={error} />}

        {/* Table */}
        {departments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">{t('department.noData')}</p>
            {canEdit && (
              <Button className="mt-4" onClick={openCreate}>
                {t('department.createFirst')}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left whitespace-nowrap min-w-[160px]">{t('department.colName')}</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap hidden sm:table-cell w-24">{t('department.colCode')}</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap">{t('department.colWorkingType')}</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap hidden md:table-cell">{t('department.colBranch')}</th>
                  <th className="px-5 py-3 text-right whitespace-nowrap hidden lg:table-cell">{t('department.colPositions')}</th>
                  <th className="px-5 py-3 text-right whitespace-nowrap hidden lg:table-cell">{t('department.colEmployees')}</th>
                  <th className="px-5 py-3 text-center whitespace-nowrap hidden sm:table-cell">{t('department.colStatus')}</th>
                  {canEdit && <th className="px-5 py-3 text-right whitespace-nowrap w-32">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{dept.name}</td>
                    <td className="px-5 py-3 hidden sm:table-cell whitespace-nowrap">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                        {dept.code}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <WorkingTypeBadge type={dept.workingType} />
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{dept.branch?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-gray-500 hidden lg:table-cell">
                      {dept._count?.positions ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500 hidden lg:table-cell">
                      {dept._count?.employees ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-center hidden sm:table-cell whitespace-nowrap">
                      {dept.isActive ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 whitespace-nowrap">
                          {t('common.active')}
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                          {t('common.inactive')}
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2 whitespace-nowrap">
                          <button
                            onClick={() => openEdit(dept)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                          >
                            {t('common.edit')}
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              onClick={() => openDelete(dept)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              disabled={(dept._count?.positions ?? 0) > 0}
                              title={
                                (dept._count?.positions ?? 0) > 0
                                  ? t('department.deletePositionsFirst')
                                  : t('department.delete')
                              }
                            >
                              {t('common.delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DepartmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        department={selected}
        branches={branches}
        onSuccess={load}
      />

      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        department={selected}
        onSuccess={load}
      />
    </AppShell>
  );
}
