'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { RosterEntry, RosterStatus } from './compute';

const STATUS_VARIANT: Record<RosterStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  onTime: 'success',
  late: 'warning',
  pending: 'neutral',
  absent: 'danger',
  leave: 'info',
};

const STATUS_LABEL: Record<RosterStatus, string> = {
  onTime: 'Đúng giờ',
  late: 'Đi trễ',
  pending: 'Chưa checkin',
  absent: 'Vắng',
  leave: 'Nghỉ phép',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}

function fmtTime(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  roster: RosterEntry[];
}

type TabKey = 'all' | 'checkedIn' | RosterStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'checkedIn', label: 'Đã checkin' },
  { key: 'pending', label: 'Chưa checkin' },
  { key: 'late', label: 'Đi trễ' },
  { key: 'absent', label: 'Vắng' },
  { key: 'leave', label: 'Nghỉ phép' },
];

export function RosterList({ roster }: Props) {
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    all: roster.length,
    checkedIn: roster.filter((r) => r.status === 'onTime' || r.status === 'late').length,
    onTime: roster.filter((r) => r.status === 'onTime').length,
    late: roster.filter((r) => r.status === 'late').length,
    pending: roster.filter((r) => r.status === 'pending').length,
    absent: roster.filter((r) => r.status === 'absent').length,
    leave: roster.filter((r) => r.status === 'leave').length,
  }), [roster]);

  const byTab =
    tab === 'all' ? roster
    : tab === 'checkedIn' ? roster.filter((r) => r.status === 'onTime' || r.status === 'late')
    : roster.filter((r) => r.status === tab);

  const q = search.trim().toLowerCase();
  const visible = q
    ? byTab.filter((r) => r.fullName.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
    : byTab;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-800">Trạng thái hôm nay</h3>
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
          <Search size={14} className="shrink-0 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên hoặc mã…"
            className="w-40 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400"
          />
        </div>
        <span className="ml-auto text-xs text-gray-400">{roster.length} nhân viên dự kiến làm hôm nay</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-100 px-4 py-2.5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-gray-400">Không có nhân viên phù hợp.</div>
      ) : (
        <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
          {visible.map((entry) => (
            <div key={entry.employeeId} className="flex items-center gap-3 px-6 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600">
                {initials(entry.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{entry.fullName}</p>
                <p className="truncate text-xs text-gray-400">{entry.deptName}</p>
              </div>
              <span className="hidden shrink-0 text-xs text-gray-400 sm:block">
                {fmtTime(entry.checkinTime) ? `Vào lúc ${fmtTime(entry.checkinTime)}` : '—'}
              </span>
              <Badge label={STATUS_LABEL[entry.status]} variant={STATUS_VARIANT[entry.status]} className="shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
