'use client';

import { AppShell } from '@/components/layout/AppShell';
import { AdminAttendanceReport } from '@/app/attendance/components/admin-attendance-report';

export default function AttendanceReportPage() {
  return (
    <AppShell title="Báo cáo chấm công">
      <AdminAttendanceReport />
    </AppShell>
  );
}
