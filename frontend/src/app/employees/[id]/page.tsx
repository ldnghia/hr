'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { PageSpinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { employeeService } from '@/services/employee.service';
import { useAuth } from '@/hooks/useAuth';
import { EmployeeProfile } from '@/modules/employee/EmployeeProfile';
import { EmployeeHistory } from '@/modules/employee/EmployeeHistory';
import { EditEmployeeModal } from '@/modules/employee/EditEmployeeModal';
import { ChangePasswordModal } from '@/modules/employee/ChangePasswordModal';
import type { Employee } from '@/types';

interface HistoryRecord {
  id: number;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy?: number | null;
  effectiveDate?: string | null;
  createdAt?: string;
}

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'history', label: 'Change History' },
];

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useAuth();

  const canEdit     = user?.role === 'admin' || user?.role === 'hr';
  const canPassword = user?.role === 'admin' || user?.role === 'manager';

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [history, setHistory]   = useState<HistoryRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError]       = useState('');
  const [activeTab, setActiveTab] = useState('profile');

  const [editOpen, setEditOpen]   = useState(false);
  const [pwOpen, setPwOpen]       = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const emp = await employeeService.get(Number(id));
        setEmployee(emp);
      } catch {
        setError('Failed to load employee.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    if (activeTab !== 'history' || !id) return;
    setHistoryLoading(true);
    employeeService
      .history(Number(id))
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [activeTab, id]);

  if (loading) return <AppShell title="Employee"><PageSpinner /></AppShell>;

  if (error || !employee) {
    return (
      <AppShell title="Employee">
        <Alert message={error || 'Employee not found.'} />
        <Button variant="secondary" onClick={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell title={employee.fullName ?? 'Employee'}>
      <div className="space-y-5">
        {/* Top bar: back + action buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Employees
          </button>

          {(canEdit || canPassword) && (
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  Edit Profile
                </Button>
              )}
              {canPassword && (
                <Button variant="secondary" size="sm" onClick={() => setPwOpen(true)}>
                  Reset Password
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === 'profile' && <EmployeeProfile employee={employee} />}
        {activeTab === 'history' && (
          <EmployeeHistory records={history} loading={historyLoading} />
        )}
      </div>

      {/* Edit modal */}
      {canEdit && employee && (
        <EditEmployeeModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          employee={employee}
          onSuccess={(updated) => setEmployee(updated)}
        />
      )}

      {/* Reset password modal */}
      {canPassword && employee && (
        <ChangePasswordModal
          mode="admin"
          open={pwOpen}
          onClose={() => setPwOpen(false)}
          employeeId={employee.id}
          employeeName={employee.fullName}
        />
      )}
    </AppShell>
  );
}
