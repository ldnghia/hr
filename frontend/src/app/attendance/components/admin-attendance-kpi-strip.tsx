'use client';

import type { MonthlySummary } from './admin-attendance-report-types';

interface Props {
  summary: MonthlySummary;
  /** Controls which KPI set to show: SHIFT = Command Center KPIs, FIXED = standard KPIs */
  workingMode?: 'FIXED' | 'SHIFT';
}

function Kpi({ dot, label, value, meta }: { dot: string; label: string; value: React.ReactNode; meta: string }) {
  return (
    <div className="flex flex-col gap-1 border-r border-gray-100 px-4 py-3 last:border-r-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-gray-400 whitespace-nowrap">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <div className="font-mono text-[20px] font-semibold leading-tight tracking-tight text-gray-900 tabular-nums">
        {value}
      </div>
      <div className="text-[10.5px] text-gray-400 whitespace-nowrap">{meta}</div>
    </div>
  );
}

export function AdminAttendanceKpiStrip({ summary, workingMode }: Props) {
  const {
    totalEmployees, lateTotalEvents, earlyTotal, absentTotal, annualTotal,
    okShifts, scheduledShifts, otTotalHours, attendanceRate,
  } = summary;

  // Command Center (SHIFT): 7 KPIs — always 1 row, scroll on small screens
  if (workingMode === 'SHIFT') {
    return (
      <div className="grid grid-cols-7 border-b border-gray-100 bg-white overflow-x-auto">
        <Kpi dot="oklch(55% 0.13 200)" label="Nhân viên"        value={totalEmployees}  meta="đang theo dõi" />
        <Kpi dot="oklch(54% 0.16 152)" label="Số ca đã phân"    value={scheduledShifts} meta="ca trong tháng" />
        <Kpi dot="oklch(48% 0.18 260)" label="Số ca đã làm"     value={okShifts}        meta="ca hoàn thành" />
        <Kpi dot="oklch(58% 0.20 28)"  label="Đi trễ"           value={lateTotalEvents} meta="lượt trong tháng" />
        <Kpi dot="oklch(54% 0.13 245)" label="Về sớm"           value={earlyTotal}      meta="lượt trong tháng" />
        <Kpi dot="oklch(52% 0.22 18)"  label="Vắng mặt"         value={absentTotal}     meta="lượt không phép" />
        <Kpi dot="oklch(60% 0.15 75)"  label="Phép năm"         value={annualTotal}     meta="ngày trong tháng" />
      </div>
    );
  }

  // Fixed schedule (default): 5 KPIs — always 1 row
  return (
    <div className="grid grid-cols-5 border-b border-gray-100 bg-white">
      <Kpi dot="oklch(55% 0.13 200)" label="Nhân viên" value={totalEmployees} meta="đang theo dõi" />
      <Kpi dot="oklch(58% 0.20 28)"  label="Đi trễ"   value={lateTotalEvents} meta="lượt trong tháng" />
      <Kpi dot="oklch(54% 0.13 245)" label="Về sớm"   value={earlyTotal}      meta="lượt trong tháng" />
      <Kpi dot="oklch(52% 0.22 18)"  label="Vắng mặt" value={absentTotal}     meta="lượt không phép" />
      <Kpi dot="oklch(60% 0.15 75)"  label="Phép năm" value={annualTotal}     meta="ngày trong tháng" />
    </div>
  );
}
