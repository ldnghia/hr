'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { ChangePasswordModal } from '@/modules/employee/ChangePasswordModal';
import { EmployeeAvatar } from '@/modules/employee/EmployeeAvatar';
import { employeeService } from '@/services/employee.service';
import { statusBadge } from '@/components/ui/Badge';
import { capitalise, formatDate } from '@/utils/format';
import type { Employee } from '@/types';

interface FormState {
  fullName: string;
  email: string;
  phone: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

export default function ProfilePage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [form, setForm]         = useState<FormState>({ fullName: '', email: '', phone: '' });
  const [errors, setErrors]     = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [dirty, setDirty]       = useState(false);

  const [pwOpen, setPwOpen]     = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setFetchError('');
      try {
        const me = await employeeService.getMe();
        setEmployee(me);
        setForm({
          fullName: me.fullName ?? '',
          email:    me.email    ?? '',
          phone:    me.phone    ?? '',
        });
      } catch {
        setFetchError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaved(false);
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
    setSaved(false);
    try {
      const updated = await employeeService.updateMe({
        fullName: form.fullName.trim(),
        email:    form.email.trim(),
        phone:    form.phone.trim() || undefined,
      });
      setEmployee(updated);
      setDirty(false);
      setSaved(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AppShell title="My Profile"><PageSpinner /></AppShell>;

  if (fetchError || !employee) {
    return (
      <AppShell title="My Profile">
        <Alert variant="error" message={fetchError || 'Profile not found.'} />
      </AppShell>
    );
  }

  return (
    <AppShell title="My Profile">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Hero card */}
        <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <EmployeeAvatar name={employee.fullName ?? 'U'} size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="truncate text-xl font-bold text-gray-900">{employee.fullName}</h2>
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
          <div className="hidden shrink-0 text-right sm:block">
            <p className="font-mono text-lg font-bold text-indigo-600">{employee.code}</p>
            <p className="text-xs text-gray-400">Employee Code</p>
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-gray-700">
            Edit Profile
          </h3>

          {apiError && <Alert variant="error" message={apiError} className="mb-4" />}
          {saved && (
            <Alert variant="success" message="Profile updated successfully." className="mb-4" />
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPwOpen(true)}
              >
                Change Password
              </Button>
              <Button type="submit" loading={saving} disabled={!dirty}>
                Update Profile
              </Button>
            </div>
          </form>
        </div>

        {/* Read-only work info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
            Work Information
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {[
              { label: 'Employee Code', value: <span className="font-mono">{employee.code}</span> },
              { label: 'Role',          value: capitalise(employee.role ?? '') },
              { label: 'Department',    value: employee.department?.name ?? '—' },
              { label: 'Position',      value: employee.position?.name ?? '—' },
              { label: 'Branch',        value: employee.branch?.name ?? '—' },
              { label: 'Join Date',     value: formatDate(employee.joinDate) },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                <dd className="mt-1 text-sm text-gray-800">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

      </div>

      <ChangePasswordModal
        mode="self"
        open={pwOpen}
        onClose={() => setPwOpen(false)}
      />
    </AppShell>
  );
}
