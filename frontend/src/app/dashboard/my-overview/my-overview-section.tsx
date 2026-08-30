'use client';

import { useEffect, useState } from 'react';
import { attendanceService } from '@/services/attendance.service';
import { Alert } from '@/components/ui/Alert';
import { TodayStatusCard } from './today-status-card';
import { MonthSummaryCards } from './month-summary-cards';
import { QuickActions } from './quick-actions';
import type { AttendanceSession } from '@/types';

export function MyOverviewSection() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [lateCount, setLateCount] = useState(0);
  const [earlyCount, setEarlyCount] = useState(0);
  const [leaveDays, setLeaveDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [sessionsRes, summaryRes] = await Promise.allSettled([
          attendanceService.todaySessions(),
          attendanceService.summary(),
        ]);
        if (cancelled) return;

        if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value);

        if (summaryRes.status === 'fulfilled') {
          const summary = summaryRes.value as {
            records: { date: string; isLate: boolean; isEarlyOut: boolean; isOnLeave?: boolean }[];
          };
          const records = summary.records ?? [];
          setLateCount(records.filter((r) => r.isLate).length);
          setEarlyCount(records.filter((r) => r.isEarlyOut).length);
          setLeaveDays(new Set(records.filter((r) => r.isOnLeave).map((r) => r.date)).size);
        }
      } catch {
        if (!cancelled) setError('Không thể tải dữ liệu chấm công của bạn.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const monthLabel = new Date().toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  if (error) return <Alert variant="error" message={error} />;

  return (
    <div className="space-y-5">
      <QuickActions />
      <TodayStatusCard sessions={sessions} loading={loading} />
      <MonthSummaryCards
        loading={loading}
        lateCount={lateCount}
        earlyCount={earlyCount}
        leaveDays={leaveDays}
        monthLabel={monthLabel}
      />
    </div>
  );
}
