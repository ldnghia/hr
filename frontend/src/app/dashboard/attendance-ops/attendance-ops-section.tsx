'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Spin } from 'antd';
import { StatCard } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { FacetedFilter } from '@/components/ui/FacetedFilter';
import { employeeService } from '@/services/employee.service';
import { attendanceService } from '@/services/attendance.service';
import { shiftScheduleService } from '@/services/shift-schedule.service';
import { RosterList } from './roster-list';
import { WeeklyTrendChart } from './weekly-trend-chart';
import { ApprovalsPanel } from './approvals-panel';
import { DeptBreakdown } from './dept-breakdown';
import { computeTodaySnapshot, computeWeeklyTrend, last7Dates, todayStr, type TodaySnapshot, type DayTrend } from './compute';
import type { AttendanceRecord, Employee } from '@/types';

interface RawData {
  employees: Employee[];
  todayRecords: AttendanceRecord[];
  weekRecords: AttendanceRecord[];
  leaveRequests: { employeeId: number; fromDate: string; toDate: string }[];
  scheduledEmpIds: Set<number>;
  expectedStartByEmp: Map<number, string>;
  nowHM: string;
  today: string;
  days: string[];
}

type WorkingModeFilter = 'FIXED' | 'SHIFT';
const WORKING_MODE_OPTIONS = [
  { value: 'FIXED', label: 'Ca cố định' },
  { value: 'SHIFT', label: 'Ca xoay (CC)' },
];

const ICONS = {
  users: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  check: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  clock: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  x: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  calendar: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  pending: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l3 1.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeDasharray="2 2.5" />
    </svg>
  ),
};

/** Temporarily hidden — unreliable while dev/demo data has no real check-ins for
 * the actual current date. Flip back to true once there's live data to verify against. */
const SHOW_DEPT_BREAKDOWN = false;

export function AttendanceOpsSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState<RawData | null>(null);
  const [modeFilter, setModeFilter] = useState<WorkingModeFilter[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = todayStr();
      const days = last7Dates();

      const [empRes, attRes, todaySchedule, shifts] = await Promise.all([
        employeeService.list({ status: 'official', limit: 500 }),
        attendanceService.report({ dateFrom: days[0], dateTo: today, limit: 5000 }),
        shiftScheduleService.listRange({ dateFrom: today, dateTo: today }),
        attendanceService.shifts(),
      ]);

      // Employees flagged attendanceExempt are not required to check in — keep them
      // out of the live ops roster/stats entirely, independent of the report toggle.
      const employees: Employee[] = (empRes.data ?? []).filter((e) => !e.attendanceExempt);
      const records = attRes.data ?? [];
      const leaveRequests = attRes.leaveRequests ?? [];
      const scheduledEmpIds = new Set(todaySchedule.map((s) => s.employeeId));

      // Default shift start time, per department — most FIXED employees don't have
      // a personal shiftId set, so they fall back to their department's (or the
      // company-wide) default shift to know when their day is expected to start.
      const defaultStartByDept = new Map<number, string>();
      let globalDefaultStart: string | undefined;
      shifts.forEach((sh) => {
        if (!sh.isDefault) return;
        if (sh.departmentId) defaultStartByDept.set(sh.departmentId, sh.startTime);
        else globalDefaultStart = sh.startTime;
      });

      // Expected shift-start time per employee today — FIXED staff use their assigned
      // shift (or the department/company default when unset), SHIFT (CC) staff use
      // whatever shift they're scheduled for today.
      const expectedStartByEmp = new Map<number, string>();
      employees.forEach((emp) => {
        if (emp.workingMode === 'SHIFT') return; // resolved below from today's schedule
        const start =
          emp.currentShift?.startTime ??
          (emp.departmentId ? defaultStartByDept.get(emp.departmentId) : undefined) ??
          globalDefaultStart;
        if (start) expectedStartByEmp.set(emp.id, start);
      });
      todaySchedule.forEach((s) => {
        expectedStartByEmp.set(s.employeeId, s.shift.startTime);
      });

      const now = new Date();
      const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const todayRecords = records.filter((r) => {
        const d = new Date(r.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === today;
      });

      setRaw({
        employees, todayRecords, weekRecords: records, leaveRequests,
        scheduledEmpIds, expectedStartByEmp, nowHM, today, days,
      });
    } catch {
      setError('Không thể tải dữ liệu điều hành chấm công.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recompute purely client-side when the working-mode filter changes — no refetch needed.
  const { snapshot, trend } = useMemo<{ snapshot: TodaySnapshot | null; trend: DayTrend[] }>(() => {
    if (!raw) return { snapshot: null, trend: [] };
    const matchesFilter = (mode?: string) => modeFilter.length === 0 || modeFilter.includes(mode as WorkingModeFilter);
    const filteredEmployees = raw.employees.filter((e) => matchesFilter(e.workingMode));
    const filteredEmpIds = new Set(filteredEmployees.map((e) => e.id));
    const filteredWeekRecords = modeFilter.length === 0
      ? raw.weekRecords
      : raw.weekRecords.filter((r) => filteredEmpIds.has(r.employeeId));

    return {
      snapshot: computeTodaySnapshot(
        filteredEmployees, raw.todayRecords, raw.leaveRequests,
        raw.scheduledEmpIds, raw.expectedStartByEmp, raw.nowHM, raw.today,
      ),
      trend: computeWeeklyTrend(filteredWeekRecords, raw.days),
    };
  }, [raw, modeFilter]);

  if (error) return <Alert variant="error" message={error} />;

  const s = snapshot;
  const presentRate = s && s.workingToday > 0 ? Math.round((s.present / s.workingToday) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Điều hành chấm công hôm nay</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FacetedFilter
            label="Loại ca"
            options={WORKING_MODE_OPTIONS}
            selected={modeFilter}
            onChange={(v) => setModeFilter(v as WorkingModeFilter[])}
            showSearch={false}
            clearLabel="Bỏ chọn"
            panelWidth={180}
          />
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Làm mới"
            title="Làm mới"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCw size={15} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
      </div>

      <Spin spinning={loading} size="default">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Tổng nhân viên" value={s?.totalEmployees ?? 0} color="indigo" icon={ICONS.users} />
          <StatCard
            label="Đã chấm công"
            value={s?.present ?? 0}
            color="emerald"
            sub={`${presentRate}% trên tổng số dự kiến làm hôm nay`}
            icon={ICONS.check}
          />
          <StatCard label="Chưa checkin" value={s?.pending ?? 0} color="indigo" sub="Chưa tới giờ ca" icon={ICONS.pending} />
          <StatCard label="Đi trễ" value={s?.late ?? 0} color="amber" icon={ICONS.clock} />
          <StatCard label="Vắng không phép" value={s?.absent ?? 0} color="rose" icon={ICONS.x} />
          <StatCard label="Đang nghỉ phép" value={s?.onLeave ?? 0} color="indigo" icon={ICONS.calendar} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
          <RosterList roster={s?.roster ?? []} />
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-800">Tỷ lệ đúng giờ trong tuần</h3>
              <WeeklyTrendChart days={trend} />
            </div>
            <ApprovalsPanel />
          </div>
        </div>

        {SHOW_DEPT_BREAKDOWN && <div className="mt-5"><DeptBreakdown depts={s?.byDept ?? []} /></div>}
      </Spin>
    </div>
  );
}
