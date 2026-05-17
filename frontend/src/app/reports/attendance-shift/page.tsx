'use client';

import { AppShell } from '@/components/layout/AppShell';
import { AdminAttendanceReport } from '@/app/attendance/components/admin-attendance-report';

export default function AttendanceShiftReportPage() {
  return (
    <AppShell title="Báo cáo chấm công — Command Center">
      <AdminAttendanceReport
        workingMode="SHIFT"
        title="Chấm công Command Center (Ca xoay)"
      />
    </AppShell>
  );
}
