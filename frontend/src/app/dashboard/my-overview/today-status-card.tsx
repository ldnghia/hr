import { Badge } from '@/components/ui/Badge';
import type { AttendanceSession } from '@/types';

function fmtTime(iso?: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function sessionStatus(s: AttendanceSession): { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' } {
  if (!s.checkinTime) return { label: 'Chưa checkin', variant: 'neutral' };
  if (!s.checkoutTime) return { label: s.isLate ? 'Đang làm · đi trễ' : 'Đang làm', variant: s.isLate ? 'warning' : 'info' };
  return { label: s.isLate ? 'Hoàn thành · đi trễ' : 'Hoàn thành', variant: s.isLate ? 'warning' : 'success' };
}

interface Props {
  sessions: AttendanceSession[];
  loading: boolean;
}

export function TodayStatusCard({ sessions, loading }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-800">Ca hôm nay</h3>
      </div>
      <div className="p-6">
        {loading ? (
          <p className="text-sm text-gray-400">Đang tải…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">Hôm nay bạn không có ca làm việc.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const status = sessionStatus(s);
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{s.shift?.name ?? 'Ca làm việc'}</p>
                    <p className="text-xs text-gray-400">
                      {s.shift?.startTime ?? '—'} – {s.shift?.endTime ?? '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-500">
                      Vào: <span className="font-medium text-gray-700">{fmtTime(s.checkinTime) ?? '—'}</span>
                      {' · '}
                      Ra: <span className="font-medium text-gray-700">{fmtTime(s.checkoutTime) ?? '—'}</span>
                    </p>
                    <Badge label={status.label} variant={status.variant} className="mt-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
