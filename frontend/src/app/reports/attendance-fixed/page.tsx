'use client';

import { AppShell } from '@/components/layout/AppShell';
import { AdminAttendanceReport } from '@/app/attendance/components/admin-attendance-report';

export default function AttendanceFixedReportPage() {
  return (
    <AppShell title="Báo cáo chấm công — Ca cố định">
      <AdminAttendanceReport
        workingMode="FIXED"
        title="Chấm công ca cố định"
      />
    </AppShell>
  );
}
