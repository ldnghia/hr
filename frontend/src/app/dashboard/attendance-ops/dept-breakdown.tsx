import type { DeptStat } from './compute';

function barColor(rate: number): string {
  if (rate < 80) return 'bg-rose-500';
  if (rate < 90) return 'bg-amber-500';
  return 'bg-emerald-500';
}

interface Props {
  depts: DeptStat[];
}

export function DeptBreakdown({ depts }: Props) {
  if (depts.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-800">Tỷ lệ chấm công theo phòng ban — hôm nay</h3>
        <p className="mt-0.5 text-xs text-gray-400">Sắp xếp theo mức cần chú ý trước</p>
      </div>
      <div className="flex flex-col gap-3 px-6 py-5">
        {depts.map((d) => (
          <div key={d.name} className="grid grid-cols-[1fr_2fr_44px] items-center gap-3 sm:grid-cols-[180px_1fr_48px]">
            <span className="truncate text-sm font-medium text-gray-700">
              {d.name} <span className="text-gray-400">({d.total})</span>
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${barColor(d.presentRate)}`} style={{ width: `${d.presentRate}%` }} />
            </div>
            <span className="text-right text-sm font-bold text-gray-800">{d.presentRate}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
