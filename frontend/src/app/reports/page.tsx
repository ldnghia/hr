'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { employeeService } from '@/services/employee.service';
import Link from 'next/link';

const REPORTS = [
  {
    workingMode: 'FIXED',
    title: 'Chấm công ca cố định',
    description: 'Bảng tổng hợp chấm công hàng tháng dành cho nhân viên làm việc theo ca hành chính cố định.',
    href: '/reports/attendance-fixed',
    badge: 'FIXED',
    badgeColor: 'bg-teal-50 text-teal-600 border-teal-200',
    icon: (
      <svg className="h-8 w-8 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    workingMode: 'SHIFT',
    title: 'Chấm công Command Center',
    description: 'Bảng tổng hợp chấm công hàng tháng dành cho nhân viên Phòng Command Center làm việc theo ca xoay.',
    href: '/reports/attendance-shift',
    badge: 'CA XOAY',
    badgeColor: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    icon: (
      <svg className="h-8 w-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function ReportsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';

  const [myWorkingMode, setMyWorkingMode] = useState<string | null>(null);
  const [modeLoaded, setModeLoaded] = useState(isAdminOrHr ?? false);

  useEffect(() => {
    if (!user || isAdminOrHr) { setModeLoaded(true); return; }
    employeeService.get(user.id)
      .then(emp => setMyWorkingMode(emp.workingMode ?? 'FIXED'))
      .catch(() => setMyWorkingMode('FIXED'))
      .finally(() => setModeLoaded(true));
  }, [user]);

  const visibleReports = isAdminOrHr
    ? REPORTS
    : REPORTS.filter(r => r.workingMode === myWorkingMode);

  return (
    <AppShell title={t('reports.title')}>
      {!modeLoaded ? null : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleReports.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100/50"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl bg-gray-50 p-3 group-hover:scale-110 transition-transform">
                  {report.icon}
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${report.badgeColor}`}>
                  {report.badge}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                {report.title}
              </h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                {report.description}
              </p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
