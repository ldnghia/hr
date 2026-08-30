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

  const [search, setSearch]                 = useState('');
  const [workingTypeFilter, setWorkingType] = useState('');
  const [branchFilter, setBranchFilter]     = useState('');

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

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departments.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q) && !d.code.toLowerCase().includes(q)) return false;
      if (workingTypeFilter && d.workingType !== workingTypeFilter) return false;
      if (branchFilter && String(d.branchId ?? '') !== branchFilter) return false;
      return true;
    });
  }, [departments, search, workingTypeFilter, branchFilter]);

  const columns: ColumnsType<Department> = [
    {
      title: t('department.colName'),
      key: 'name',
      render: (_, dept) => <span className="font-medium text-gray-900">{dept.name}</span>,
    },
    {
      title: t('department.colCode'),
      key: 'code',
      responsive: ['sm'],
      render: (_, dept) => (
        <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">{dept.code}</span>
      ),
    },
    {
      title: t('department.colWorkingType'),
      key: 'workingType',
      render: (_, dept) => <WorkingTypeBadge type={dept.workingType} />,
    },
    {
      title: t('department.colBranch'),
      key: 'branch',
      responsive: ['md'],
      render: (_, dept) => <span className="text-gray-500">{dept.branch?.name ?? '—'}</span>,
    },
    {
      title: t('department.colPositions'),
      key: 'positions',
      align: 'right',
      responsive: ['lg'],
      render: (_, dept) => <span className="text-gray-500">{dept._count?.positions ?? '—'}</span>,
    },
    {
      title: t('department.colEmployees'),
      key: 'employees',
      align: 'right',
      responsive: ['lg'],
      render: (_, dept) => <span className="text-gray-500">{dept._count?.employees ?? '—'}</span>,
    },
    {
      title: t('department.colStatus'),
      key: 'status',
      align: 'center',
      responsive: ['sm'],
      render: (_, dept) =>
        dept.isActive ? (
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
          render: (_: unknown, dept: Department) => (
            <div className="flex justify-center gap-1.5 whitespace-nowrap">
              <AntButton
                size="small"
                color="blue"
                variant="outlined"
                icon={<Pencil size={14} />}
                aria-label={t('common.edit')}
                title={t('common.edit')}
                onClick={() => openEdit(dept)}
              />
              {user?.role === 'admin' && (
                <AntButton
                  size="small"
                  color="danger"
                  variant="outlined"
                  icon={<Trash2 size={14} />}
                  aria-label={t('department.delete')}
                  disabled={(dept._count?.positions ?? 0) > 0}
                  title={
                    (dept._count?.positions ?? 0) > 0
                      ? t('department.deletePositionsFirst')
                      : t('department.delete')
                  }
                  onClick={() => openDelete(dept)}
                />
              )}
            </div>
          ),
        }]
      : []),
  ];

  if (loading) return <AppShell title={t('department.title')}><PageSpinner /></AppShell>;

  return (
    <AppShell title={t('department.title')}>
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

            <FacetedFilter
              label={t('department.colWorkingType')}
              options={[
                { value: 'FIXED', label: t('department.workingTypeFixed') },
                { value: 'SHIFT', label: t('department.workingTypeShift') },
              ]}
              selected={workingTypeFilter ? [workingTypeFilter] : []}
              onChange={(v) => setWorkingType(v[0] ?? '')}
              singleSelect
              showSearch={false}
              clearLabel={t('common.clear')}
              panelWidth={180}
            />

            {branches.length > 0 && (
              <FacetedFilter
                label={t('common.branch')}
                options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
                selected={branchFilter ? [branchFilter] : []}
                onChange={(v) => setBranchFilter(v[0] ?? '')}
                singleSelect
                clearLabel={t('common.clear')}
                panelWidth={240}
              />
            )}

            <FilterResetButton
              show={!!search || !!workingTypeFilter || !!branchFilter}
              onClick={() => { setSearch(''); setWorkingType(''); setBranchFilter(''); }}
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
              <Button onClick={openCreate} className="shrink-0">{t('department.add')}</Button>
            )}
          </div>
        </div>

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
          <DataTable<Department>
            bordered
            columns={columns}
            dataSource={filteredDepartments}
            rowKey="id"
            pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], pageSize: 20 }}
            locale={{ emptyText: t('department.noData') }}
            scroll={{ x: 'max-content' }}
          />
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
