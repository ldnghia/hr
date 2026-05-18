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
import type { Department, Position } from '@/types';

// ─── Position Modal ───────────────────────────────────────────────────────────

interface PositionModalProps {
  open: boolean;
  onClose: () => void;
  position: Position | null;
  departments: Department[];
  onSuccess: () => void;
}

interface FormState {
  name: string;
  code: string;
  departmentId: string;
  description: string;
  isActive: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  name: '',
  code: '',
  departmentId: '',
  description: '',
  isActive: true,
};

function PositionModal({ open, onClose, position, departments, onSuccess }: PositionModalProps) {
  const { t } = useTranslation();
  const isEdit = position !== null;

  const [form, setForm]       = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors]   = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!open) return;
    setApiError('');
    setErrors({});
    if (isEdit && position) {
      setForm({
        name:         position.name,
        code:         position.code,
        departmentId: position.departmentId ? String(position.departmentId) : '',
        description:  position.description ?? '',
        isActive:     position.isActive,
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [open, position, isEdit]);

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim())         errs.name         = t('validation.nameRequired');
    if (!form.code.trim())         errs.code         = t('validation.codeRequired');
    if (!form.departmentId)        errs.departmentId = t('validation.departmentRequired');
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
        name:         form.name.trim(),
        code:         form.code.trim().toUpperCase(),
        departmentId: Number(form.departmentId),
        description:  form.description.trim() || undefined,
        isActive:     form.isActive,
      };
      if (isEdit && position) {
        await organizationService.updatePosition(position.id, payload);
      } else {
        await organizationService.createPosition(payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? t('position.failedToSave')));
    } finally {
      setSaving(false);
    }
  }

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Show workingType hint for the selected department
  const selectedDept = departments.find((d) => String(d.id) === form.departmentId);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t('position.edit') : t('position.add')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && <Alert variant="error" message={apiError} />}

        <Select
          label={`${t('common.department')} *`}
          value={form.departmentId}
          onChange={(e) => set('departmentId', e.target.value)}
          placeholder={t('position.selectDepartment')}
          error={errors.departmentId}
          options={departments.map((d) => ({
            value: d.id,
            label: `${d.name} (${d.code})`,
          }))}
        />

        {/* Working-type context hint */}
        {selectedDept && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              selectedDept.workingType === 'SHIFT'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}
          >
            {selectedDept.workingType === 'SHIFT'
              ? t('position.shiftNote')
              : t('position.fixedNote')}
          </div>
        )}

        <Input
          label={t('position.nameLabel')}
          placeholder={t('position.namePlaceholder')}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />

        <Input
          label={`${t('common.code')} *`}
          placeholder={t('position.codePlaceholder')}
          value={form.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
          error={errors.code}
        />

        <Input
          label={t('common.description')}
          placeholder={t('position.descriptionPlaceholder')}
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
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={saving}>
            {isEdit ? t('common.saveChanges') : t('position.add')}
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
  position: Position | null;
  onSuccess: () => void;
}

function DeleteModal({ open, onClose, position, onSuccess }: DeleteModalProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => { if (open) setError(''); }, [open]);

  async function handleDelete() {
    if (!position) return;
    setDeleting(true);
    setError('');
    try {
      await organizationService.deletePosition(position.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? t('position.failedToDelete')));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('position.delete')}>
      <div className="space-y-4">
        {error && <Alert variant="error" message={error} />}
        <p className="text-sm text-gray-600">
          {t('position.deleteConfirm', { name: position?.name ?? '' })}
        </p>
        <p className="text-xs text-gray-500">
          {t('position.deleteBlocked')}
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" variant="danger" loading={deleting} onClick={handleDelete}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit  = user?.role === 'admin' || user?.role === 'hr';

  const [positions,    setPositions]    = useState<Position[]>([]);
  const [departments,  setDepartments]  = useState<Department[]>([]);
  const [deptFilter,   setDeptFilter]   = useState('');
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  const [modalOpen,  setModalOpen]  = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected,   setSelected]   = useState<Position | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pos, depts] = await Promise.all([
        organizationService.positions(
          deptFilter ? { departmentId: Number(deptFilter) } : undefined,
        ),
        organizationService.departments(),
      ]);
      setPositions(pos);
      setDepartments(depts);
    } catch {
      setError(t('position.failedToSave'));
    } finally {
      setLoading(false);
    }
  }, [deptFilter, t]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setSelected(null); setModalOpen(true); }
  function openEdit(p: Position) { setSelected(p); setModalOpen(true); }
  function openDelete(p: Position) { setSelected(p); setDeleteOpen(true); }

  if (loading) return <AppShell title={t('position.title')}><PageSpinner /></AppShell>;

  return (
    <AppShell title={t('position.title')}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('position.title')}</h1>
            <p className="text-sm text-gray-500">
              {positions.length} {t('position.count')}
              {deptFilter && ` ${t('position.inDepartment')}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Department filter */}
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">{t('position.allDepartments')}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
            {canEdit && (
              <Button onClick={openCreate}>{t('position.add')}</Button>
            )}
          </div>
        </div>

        {error && <Alert variant="error" message={error} />}

        {/* Table */}
        {positions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">{t('position.noData')}</p>
            {canEdit && (
              <Button className="mt-4" onClick={openCreate}>{t('position.createFirst')}</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left whitespace-nowrap min-w-[160px]">{t('common.name')}</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap w-24 hidden sm:table-cell">{t('common.code')}</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap hidden md:table-cell">{t('common.department')}</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap hidden sm:table-cell">{t('department.colWorkingType')}</th>
                  <th className="px-5 py-3 text-right whitespace-nowrap hidden lg:table-cell">{t('department.colEmployees')}</th>
                  <th className="px-5 py-3 text-center whitespace-nowrap hidden sm:table-cell">{t('department.colStatus')}</th>
                  {canEdit && <th className="px-5 py-3 text-right whitespace-nowrap w-32">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {positions.map((pos) => (
                  <tr key={pos.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {pos.name}
                      {pos.description && (
                        <p className="text-xs font-normal text-gray-400 truncate max-w-xs">
                          {pos.description}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap hidden sm:table-cell">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                        {pos.code}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700 hidden md:table-cell">
                      {pos.department ? (
                        <span>
                          {pos.department.name}{' '}
                          <span className="text-xs text-gray-400">({pos.department.code})</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      {pos.department?.workingType === 'SHIFT' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap">
                          SHIFT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 whitespace-nowrap">
                          FIXED
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500 hidden lg:table-cell">
                      {pos._count?.employees ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-center whitespace-nowrap hidden sm:table-cell">
                      {pos.isActive ? (
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
                            onClick={() => openEdit(pos)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => openDelete(pos)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            disabled={(pos._count?.employees ?? 0) > 0}
                            title={
                              (pos._count?.employees ?? 0) > 0
                                ? t('position.cannotDeleteEmployees')
                                : t('position.delete')
                            }
                          >
                            {t('common.delete')}
                          </button>
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

      <PositionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        position={selected}
        departments={departments}
        onSuccess={load}
      />

      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        position={selected}
        onSuccess={load}
      />
    </AppShell>
  );
}
