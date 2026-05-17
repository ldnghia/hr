'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ShiftAssignmentMatrixResponse } from '@/types';
import { shiftAssignmentService } from '@/services/shift-assignment.service';
import { useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { ScheduleWeeklyTab } from './components/schedule-weekly-tab';

export default function ShiftAssignmentsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  const now = new Date();
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [data, setData] = useState<ShiftAssignmentMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current month matrix to get employee list + available shifts
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await shiftAssignmentService.getMonthMatrix({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        departmentId,
      });
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell title="Phân ca">
      <div className="max-w-full">
        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        <ScheduleWeeklyTab
          rows={data?.rows ?? []}
          shifts={data?.shifts ?? []}
          isManager={isManager}
          departmentId={departmentId}
          onDepartmentChange={setDepartmentId}
        />
      </div>
    </AppShell>
  );
}
