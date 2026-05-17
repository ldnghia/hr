'use client';

import type { MonthlySummary } from './admin-attendance-report-types';

interface Props {
  summary: MonthlySummary;
}

function Kpi({ dot, label, value, meta }: { dot: string; label: string; value: React.ReactNode; meta: string }) {
  return (
    <div className="flex flex-col gap-1 border-r border-gray-100 px-5 py-3.5 last:border-r-0">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <div className="font-mono text-[22px] font-semibold leading-tight tracking-tight text-gray-900 tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-gray-400">{meta}</div>
    </div>
  );
}

export function AdminAttendanceKpiStrip({ summary }: Props) {
  const {
    totalEmployees, attendanceRate, lateTotalEvents,
    absentTotal, annualTotal, otTotalHours, okShifts, scheduledShifts,
  } = summary;

  return (
    <div className="grid grid-cols-6 border-b border-gray-100 bg-white">
      <Kpi
        dot="oklch(55% 0.13 200)"
        label="Nhân viên"
        value={totalEmployees}
        meta="tổng số đang theo dõi"
      />
      <Kpi
        dot="oklch(54% 0.16 152)"
        label="Tỷ lệ chuyên cần"
        value={<>{attendanceRate.toFixed(1)}<span className="text-sm font-normal text-gray-400">%</span></>}
        meta={`${okShifts}/${scheduledShifts} ca tham gia`}
      />
      <Kpi
        dot="oklch(58% 0.20 28)"
        label="Đi trễ"
        value={lateTotalEvents}
        meta="lượt trong tháng"
      />
      <Kpi
        dot="oklch(52% 0.22 18)"
        label="Vắng mặt"
        value={absentTotal}
        meta="lượt vắng không phép"
      />
      <Kpi
        dot="oklch(60% 0.15 75)"
        label="Phép năm đã dùng"
        value={annualTotal}
        meta="ngày trong tháng"
      />
      <Kpi
        dot="oklch(60% 0.17 45)"
        label="Giờ tăng ca"
        value={<>{otTotalHours.toFixed(1)}<span className="text-sm font-normal text-gray-400">h</span></>}
        meta="cộng dồn toàn công ty"
      />
    </div>
  );
}
