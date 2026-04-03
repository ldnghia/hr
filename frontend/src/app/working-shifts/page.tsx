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
import { workingShiftService } from '@/services/working-shift.service';
import { organizationService } from '@/services/organization.service';
import type { Shift, Department } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string) { return t; }

function CrossDayBadge() {
  return (
    <span className="ml-1.5 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
      crosses midnight
    </span>
  );
}

// ─── Shift Modal ──────────────────────────────────────────────────────────────

interface ShiftModalProps {
  open: boolean;
  onClose: () => void;
  shift: Shift | null;
  departments: Department[];
  onSuccess: () => void;
}

interface FormState {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  isCrossDay: boolean;
  breakMinutes: string;
  graceLateMinutes: string;
  graceEarlyMinutes: string;
  departmentId: string;
  isDefault: boolean;
  isActive: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  name: '',
  code: '',
  startTime: '',
  endTime: '',
  isCrossDay: false,
  breakMinutes: '60',
  graceLateMinutes: '15',
  graceEarlyMinutes: '15',
  departmentId: '',
  isDefault: false,
  isActive: true,
};

const TIME_RE = /^\d{2}:\d{2}$/;
const CODE_RE = /^[A-Z0-9_-]+$/;

function ShiftModal({ open, onClose, shift, departments, onSuccess }: ShiftModalProps) {
  const isEdit = shift !== null;

  const [form, setForm]     = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApiError('');
    setErrors({});
    if (isEdit && shift) {
      setForm({
        name:              shift.name,
        code:              shift.code,
        startTime:         shift.startTime,
        endTime:           shift.endTime,
        isCrossDay:        shift.isCrossDay,
        breakMinutes:      String(shift.breakMinutes),
        graceLateMinutes:  String(shift.graceLateMinutes),
        graceEarlyMinutes: String(shift.graceEarlyMinutes),
        departmentId:      shift.departmentId ? String(shift.departmentId) : '',
        isDefault:         shift.isDefault,
        isActive:          shift.isActive,
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [open, shift, isEdit]);

  // Auto-detect isCrossDay when times change
  useEffect(() => {
    if (!form.startTime || !form.endTime) return;
    if (!TIME_RE.test(form.startTime) || !TIME_RE.test(form.endTime)) return;
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const crossDay = eh * 60 + em < sh * 60 + sm;
    if (crossDay !== form.isCrossDay) {
      setForm((f) => ({ ...f, isCrossDay: crossDay }));
    }
  }, [form.startTime, form.endTime]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim())                         errs.name = 'Name is required';
    if (!form.code.trim())                         errs.code = 'Code is required';
    else if (!CODE_RE.test(form.code))             errs.code = 'Uppercase letters, digits, underscores or hyphens only';
    if (!form.startTime)                           errs.startTime = 'Start time is required';
    else if (!TIME_RE.test(form.startTime))        errs.startTime = 'Must be HH:MM';
    if (!form.endTime)                             errs.endTime = 'End time is required';
    else if (!TIME_RE.test(form.endTime))          errs.endTime = 'Must be HH:MM';
    else if (form.startTime === form.endTime)      errs.endTime = 'Start and end time must differ';
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
        name:              form.name.trim(),
        code:              form.code.trim().toUpperCase(),
        startTime:         form.startTime,
        endTime:           form.endTime,
        isCrossDay:        form.isCrossDay,
        breakMinutes:      Number(form.breakMinutes),
        graceLateMinutes:  Number(form.graceLateMinutes),
        graceEarlyMinutes: Number(form.graceEarlyMinutes),
        departmentId:      form.departmentId ? Number(form.departmentId) : null,
        isDefault:         form.isDefault,
        isActive:          form.isActive,
      };
      if (isEdit && shift) {
        await workingShiftService.update(shift.id, payload);
      } else {
        await workingShiftService.create(payload);
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

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Working Shift' : 'Add Working Shift'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && <Alert variant="error" message={apiError} />}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Name *"
            placeholder="e.g. Morning Shift"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
          <Input
            label="Code *"
            placeholder="e.g. CC_MORNING"
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            error={errors.code}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start Time *"
            placeholder="08:00"
            value={form.startTime}
            onChange={(e) => set('startTime', e.target.value)}
            error={errors.startTime}
          />
          <div>
            <Input
              label="End Time *"
              placeholder="18:00"
              value={form.endTime}
              onChange={(e) => set('endTime', e.target.value)}
              error={errors.endTime}
            />
            {form.isCrossDay && (
              <p className="mt-1 text-xs text-purple-600">Night shift — spans midnight</p>
            )}
          </div>
        </div>

        <Select
          label="Department (leave blank for global shift)"
          value={form.departmentId}
          onChange={(e) => set('departmentId', e.target.value)}
          placeholder="— Global (no department) —"
          options={departments.map((d) => ({
            value: d.id,
            label: `${d.name} (${d.code}) — ${d.workingType}`,
          }))}
        />

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Break (min)"
            type="number"
            value={form.breakMinutes}
            onChange={(e) => set('breakMinutes', e.target.value)}
          />
          <Input
            label="Grace Late (min)"
            type="number"
            value={form.graceLateMinutes}
            onChange={(e) => set('graceLateMinutes', e.target.value)}
          />
          <Input
            label="Grace Early-Out (min)"
            type="number"
            value={form.graceEarlyMinutes}
            onChange={(e) => set('graceEarlyMinutes', e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => set('isDefault', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            Default shift (used as fallback for auto-detection)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            Active
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save Changes' : 'Create Shift'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  shift: Shift | null;
  onSuccess: () => void;
}

function DeleteModal({ open, onClose, shift, onSuccess }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) setError(''); }, [open]);

  async function handleDelete() {
    if (!shift) return;
    setDeleting(true);
    setError('');
    try {
      await workingShiftService.delete(shift.id);
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
    <Modal open={open} onClose={onClose} title="Delete Working Shift">
      <div className="space-y-4">
        {error && <Alert variant="error" message={error} />}
        <p className="text-sm text-gray-600">
          Delete shift{' '}
          <span className="font-semibold text-gray-900">{shift?.name}</span>?
        </p>
        <p className="text-xs text-gray-500">
          Blocked if any employees are currently assigned to this shift.
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

export default function WorkingShiftsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'hr';

  const [shifts,      setShifts]      = useState<Shift[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilter,  setDeptFilter]  = useState('');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  const [modalOpen,  setModalOpen]  = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected,   setSelected]   = useState<Shift | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [shiftList, deptList] = await Promise.all([
        workingShiftService.findAll(
          deptFilter
            ? { departmentId: Number(deptFilter), includeGlobal: true }
            : undefined,
        ),
        organizationService.departments(),
      ]);
      setShifts(shiftList);
      setDepartments(deptList);
    } catch {
      setError('Failed to load working shifts');
    } finally {
      setLoading(false);
    }
  }, [deptFilter]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setSelected(null); setModalOpen(true); }
  function openEdit(s: Shift) { setSelected(s); setModalOpen(true); }
  function openDelete(s: Shift) { setSelected(s); setDeleteOpen(true); }

  if (loading) return <AppShell title="Working Shifts"><PageSpinner /></AppShell>;

  return (
    <AppShell title="Working Shifts">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Working Shifts</h1>
            <p className="text-sm text-gray-500">
              {shifts.length} shift{shifts.length !== 1 && 's'}
              {deptFilter && ' for selected department'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All shifts</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
            {canEdit && (
              <Button onClick={openCreate}>+ Add Shift</Button>
            )}
          </div>
        </div>

        {error && <Alert variant="error" message={error} />}

        {shifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">No shifts found.</p>
            {canEdit && (
              <Button className="mt-4" onClick={openCreate}>Create a shift</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Code</th>
                  <th className="px-5 py-3 text-left">Time</th>
                  <th className="px-5 py-3 text-left">Department</th>
                  <th className="px-5 py-3 text-right">Break</th>
                  <th className="px-5 py-3 text-right">Grace Late</th>
                  <th className="px-5 py-3 text-center">Default</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  {canEdit && <th className="px-5 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-5 py-3">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                        {s.code}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      <span className="font-mono">
                        {formatTime(s.startTime)} → {formatTime(s.endTime)}
                      </span>
                      {s.isCrossDay && <CrossDayBadge />}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {s.department ? (
                        <span>
                          {s.department.name}{' '}
                          <span className="text-xs text-gray-400">({s.department.code})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-indigo-600 font-medium">Global</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">
                      {s.breakMinutes}m
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">
                      {s.graceLateMinutes}m
                    </td>
                    <td className="px-5 py-3 text-center">
                      {s.isDefault && (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                          Default
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {s.isActive ? (
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
                            onClick={() => openEdit(s)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                          >
                            Edit
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              onClick={() => openDelete(s)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              disabled={(s._count?.currentEmployees ?? 0) > 0}
                              title={
                                (s._count?.currentEmployees ?? 0) > 0
                                  ? 'Cannot delete — employees assigned'
                                  : 'Delete shift'
                              }
                            >
                              Delete
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

      <ShiftModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        shift={selected}
        departments={departments}
        onSuccess={load}
      />

      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        shift={selected}
        onSuccess={load}
      />
    </AppShell>
  );
}
