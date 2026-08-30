import { StatCard } from '@/components/ui/Card';

const ICONS = {
  clock: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  logout: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  leaveTaken: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4M4 12l6-6M4 12l6 6" />
    </svg>
  ),
};

interface Props {
  loading: boolean;
  lateCount: number;
  earlyCount: number;
  leaveDays: number;
  monthLabel: string;
}

export function MonthSummaryCards({ loading, lateCount, earlyCount, leaveDays, monthLabel }: Props) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Tổng hợp {monthLabel}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Số lần đi trễ" value={loading ? '—' : lateCount} color="amber" icon={ICONS.clock} />
        <StatCard label="Số lần về sớm" value={loading ? '—' : earlyCount} color="amber" icon={ICONS.logout} />
        <StatCard label="Ngày nghỉ" value={loading ? '—' : leaveDays} color="indigo" icon={ICONS.leaveTaken} />
      </div>
    </div>
  );
}
