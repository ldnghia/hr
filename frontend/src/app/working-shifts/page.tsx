'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { RotateCw, Pencil, Trash2 } from 'lucide-react';
import { Button as AntButton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { FacetedFilter, FilterResetButton } from '@/components/ui/FacetedFilter';
import { DataTable } from '@/components/antd/data-table';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { workingShiftService } from '@/services/working-shift.service';
import { organizationService } from '@/services/organization.service';
import type { Shift, Department } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string) { return t; }

function CrossDayBadge() {
  const { t } = useTranslation();
  return (
    <span className="ml-1.5 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
      {t('workingShift.crossesMidnight')}
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
  const { t } = useTranslation();
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
    if (!form.name.trim())                         errs.name = t('validation.nameRequired');
    if (!form.code.trim())                         errs.code = t('validation.codeRequired');
    else if (!CODE_RE.test(form.code))             errs.code = t('validation.codeRequired');
    if (!form.startTime)                           errs.startTime = t('validation.dateRequired');
    else if (!TIME_RE.test(form.startTime))        errs.startTime = 'Must be HH:MM';
    if (!form.endTime)                             errs.endTime = t('validation.dateRequired');
    else if (!TIME_RE.test(form.endTime))          errs.endTime = 'Must be HH:MM';
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
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? t('workingShift.failedToSave')));
    } finally {
      setSaving(false);
    }
  }

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t('workingShift.edit') : t('workingShift.add')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && <Alert variant="error" message={apiError} />}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={`${t('common.name')} *`}
            placeholder="e.g. Morning Shift"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
          <Input
            label={`${t('common.code')} *`}
            placeholder="e.g. CC_MORNING"
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            error={errors.code}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('workingShift.startTime')}
            placeholder="08:00"
            value={form.startTime}
            onChange={(e) => set('startTime', e.target.value)}
            error={errors.startTime}
          />
          <div>
            <Input
              label={t('workingShift.endTime')}
              placeholder="18:00"
              value={form.endTime}
              onChange={(e) => set('endTime', e.target.value)}
              error={errors.endTime}
            />
            {form.isCrossDay && (
              <p className="mt-1 text-xs text-purple-600">{t('workingShift.nightShift')}</p>
            )}
          </div>
        </div>

        <Select
          label={t('workingShift.departmentOptional')}
          value={form.departmentId}
          onChange={(e) => set('departmentId', e.target.value)}
          placeholder={t('workingShift.departmentGlobal')}
          options={departments.map((d) => ({
            value: d.id,
            label: `${d.name} (${d.code}) — ${d.workingType}`,
          }))}
        />

        <div className="grid grid-cols-3 gap-3">
          <Input
            label={t('workingShift.breakMinutes')}
            type="number"
            value={form.breakMinutes}
            onChange={(e) => set('breakMinutes', e.target.value)}
          />
          <Input
            label={t('workingShift.graceLateMinutes')}
            type="number"
            value={form.graceLateMinutes}
            onChange={(e) => set('graceLateMinutes', e.target.value)}
          />
          <Input
            label={t('workingShift.graceEarlyMinutes')}
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
            {t('workingShift.isDefault')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            {t('position.active')}
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={saving}>
            {isEdit ? t('common.saveChanges') : t('workingShift.add')}
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
  const { t } = useTranslation();
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
      setError(Array.isArray(msg) ? msg[0] : (msg ?? t('workingShift.failedToSave')));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('workingShift.delete')}>
      <div className="space-y-4">
        {error && <Alert variant="error" message={error} />}
        <p className="text-sm text-gray-600">
          {t('position.deleteConfirm', { name: shift?.name ?? '' })}
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

export default function WorkingShiftsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'hr';

  const [shifts,      setShifts]      = useState<Shift[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilter,  setDeptFilter]  = useState('');
  const [search,      setSearch]      = useState('');
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
      setError(t('workingShift.failedToSave'));
    } finally {
      setLoading(false);
    }
  }, [deptFilter, t]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setSelected(null); setModalOpen(true); }
  function openEdit(s: Shift) { setSelected(s); setModalOpen(true); }
  function openDelete(s: Shift) { setSelected(s); setDeleteOpen(true); }

  const filteredShifts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shifts;
    return shifts.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [shifts, search]);

  const columns: ColumnsType<Shift> = [
    {
      title: t('workingShift.colName'),
      key: 'name',
      render: (_, s) => <span className="font-medium text-gray-900">{s.name}</span>,
    },
    {
      title: t('workingShift.colCode'),
      key: 'code',
      responsive: ['sm'],
      render: (_, s) => (
        <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">{s.code}</span>
      ),
    },
    {
      title: t('workingShift.colTime'),
      key: 'time',
      render: (_, s) => (
        <span className="whitespace-nowrap text-gray-700">
          <span className="font-mono">{formatTime(s.startTime)} → {formatTime(s.endTime)}</span>
          {s.isCrossDay && <CrossDayBadge />}
        </span>
      ),
    },
    {
      title: t('workingShift.colDepartment'),
      key: 'department',
      responsive: ['md'],
      render: (_, s) =>
        s.department ? (
          <span className="text-gray-500">
            {s.department.name} <span className="text-xs text-gray-400">({s.department.code})</span>
          </span>
        ) : (
          <span className="text-xs font-medium text-indigo-600">{t('workingShift.global')}</span>
        ),
    },
    {
      title: t('workingShift.colBreak'),
      key: 'break',
      align: 'right',
      responsive: ['lg'],
      render: (_, s) => <span className="text-gray-500">{s.breakMinutes}m</span>,
    },
    {
      title: t('workingShift.colGraceLate'),
      key: 'grace',
      align: 'right',
      responsive: ['lg'],
      render: (_, s) => <span className="text-gray-500">{s.graceLateMinutes}m</span>,
    },
    {
      title: t('workingShift.colDefault'),
      key: 'default',
      align: 'center',
      responsive: ['md'],
      render: (_, s) =>
        s.isDefault ? (
          <span className="whitespace-nowrap rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            {t('workingShift.colDefault')}
          </span>
        ) : null,
    },
    {
      title: t('workingShift.colStatus'),
      key: 'status',
      align: 'center',
      responsive: ['sm'],
      render: (_, s) =>
        s.isActive ? (
          <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            {t('common.active')}
          </span>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
            {t('common.inactive')}
          </span>
        ),
    },
    ...(canEdit
      ? [{
          title: '',
          key: 'actions',
          align: 'center' as const,
          width: user?.role === 'admin' ? 96 : 60,
          render: (_: unknown, s: Shift) => (
            <div className="flex justify-center gap-1.5 whitespace-nowrap">
              <AntButton
                size="small"
                color="blue"
                variant="outlined"
                icon={<Pencil size={14} />}
                aria-label={t('common.edit')}
                title={t('common.edit')}
                onClick={() => openEdit(s)}
              />
              {user?.role === 'admin' && (
                <AntButton
                  size="small"
                  color="danger"
                  variant="outlined"
                  icon={<Trash2 size={14} />}
                  aria-label={t('workingShift.delete')}
                  disabled={(s._count?.currentEmployees ?? 0) > 0}
                  title={
                    (s._count?.currentEmployees ?? 0) > 0
                      ? t('workingShift.cannotDeleteEmployees')
                      : t('workingShift.delete')
                  }
                  onClick={() => openDelete(s)}
                />
              )}
            </div>
          ),
        }]
      : []),
  ];

  if (loading) return <AppShell title={t('workingShift.title')}><PageSpinner /></AppShell>;

  return (
    <AppShell title={t('workingShift.title')}>
      <div className="space-y-4">

        {error && <Alert variant="error" message={error} />}

        {/* Toolbar: filters (left) + actions (right) — reference: booking list toolbar */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-full sm:w-64">
              <Input
                placeholder={t('employee.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {departments.length > 0 && (
              <FacetedFilter
                label={t('workingShift.colDepartment')}
                options={departments.map((d) => ({ value: String(d.id), label: `${d.name} (${d.code})` }))}
                selected={deptFilter ? [deptFilter] : []}
                onChange={(v) => setDeptFilter(v[0] ?? '')}
                singleSelect
                clearLabel={t('common.clear')}
                panelWidth={260}
              />
            )}

            <FilterResetButton
              show={!!search || !!deptFilter}
              onClick={() => { setSearch(''); setDeptFilter(''); }}
              label={t('common.clear')}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              aria-label={t('common.refresh', 'Làm mới')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCw size={15} className={loading ? 'animate-spin' : undefined} />
            </button>
            {canEdit && (
              <Button onClick={openCreate} className="shrink-0">{t('workingShift.add')}</Button>
            )}
          </div>
        </div>

        {shifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">{t('workingShift.noData')}</p>
            {canEdit && (
              <Button className="mt-4" onClick={openCreate}>{t('workingShift.createFirst')}</Button>
            )}
          </div>
        ) : (
          <DataTable<Shift>
            bordered
            columns={columns}
            dataSource={filteredShifts}
            rowKey="id"
            pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], pageSize: 20 }}
            locale={{ emptyText: t('workingShift.noData') }}
            scroll={{ x: 'max-content' }}
          />
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
