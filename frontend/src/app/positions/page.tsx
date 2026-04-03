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
    if (!form.name.trim())         errs.name         = 'Position name is required';
    if (!form.code.trim())         errs.code         = 'Code is required';
    else if (!/^[A-Z0-9_-]+$/.test(form.code))
      errs.code = 'Code must be uppercase letters, digits, underscores or hyphens';
    if (!form.departmentId)        errs.departmentId = 'Department is required';
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
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? 'An error occurred'));
    } finally {
      setSaving(false);
    }
  }

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Show workingType hint for the selected department
  const selectedDept = departments.find((d) => String(d.id) === form.departmentId);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Position' : 'Add Position'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && <Alert variant="error" message={apiError} />}

        <Select
          label="Department *"
          value={form.departmentId}
          onChange={(e) => set('departmentId', e.target.value)}
          placeholder="— Select department —"
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
              ? '⏰  Employees in this position will work on a rotating SHIFT schedule (Morning / Afternoon / Night).'
              : '🕗  Employees in this position follow a FIXED schedule (08:00 – 18:00).'}
          </div>
        )}

        <Input
          label="Position Name *"
          placeholder="e.g. Network Operations Engineer"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />

        <Input
          label="Code *"
          placeholder="e.g. NOC"
          value={form.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
          error={errors.code}
        />

        <Input
          label="Description"
          placeholder="Optional description"
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
          Active
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save Changes' : 'Create Position'}
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
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete Position">
      <div className="space-y-4">
        {error && <Alert variant="error" message={error} />}
        <p className="text-sm text-gray-600">
          Delete position{' '}
          <span className="font-semibold text-gray-900">{position?.name}</span>?
        </p>
        <p className="text-xs text-gray-500">
          This is blocked if any employees are currently assigned to this position.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="danger" loading={deleting} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PositionsPage() {
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
      setError('Failed to load positions');
    } finally {
      setLoading(false);
    }
  }, [deptFilter]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setSelected(null); setModalOpen(true); }
  function openEdit(p: Position) { setSelected(p); setModalOpen(true); }
  function openDelete(p: Position) { setSelected(p); setDeleteOpen(true); }

  if (loading) return <AppShell title="Positions"><PageSpinner /></AppShell>;

  return (
    <AppShell title="Positions">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Positions</h1>
            <p className="text-sm text-gray-500">
              {positions.length} position{positions.length !== 1 && 's'}
              {deptFilter && ' in selected department'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Department filter */}
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
            {canEdit && (
              <Button onClick={openCreate}>+ Add Position</Button>
            )}
          </div>
        </div>

        {error && <Alert variant="error" message={error} />}

        {/* Table */}
        {positions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">No positions found.</p>
            {canEdit && (
              <Button className="mt-4" onClick={openCreate}>Create a position</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Code</th>
                  <th className="px-5 py-3 text-left">Department</th>
                  <th className="px-5 py-3 text-left">Working Type</th>
                  <th className="px-5 py-3 text-right">Employees</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  {canEdit && <th className="px-5 py-3 text-right">Actions</th>}
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
                    <td className="px-5 py-3">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                        {pos.code}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {pos.department ? (
                        <span>
                          {pos.department.name}{' '}
                          <span className="text-xs text-gray-400">({pos.department.code})</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      {pos.department?.workingType === 'SHIFT' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          SHIFT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          FIXED
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">
                      {pos._count?.employees ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {pos.isActive ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          Inactive
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEdit(pos)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openDelete(pos)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            disabled={(pos._count?.employees ?? 0) > 0}
                            title={
                              (pos._count?.employees ?? 0) > 0
                                ? 'Cannot delete — employees assigned'
                                : 'Delete position'
                            }
                          >
                            Delete
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
