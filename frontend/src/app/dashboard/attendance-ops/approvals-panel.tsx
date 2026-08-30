'use client';

import { useEffect, useState } from 'react';
import { correctionService } from '@/services/attendance-correction.service';
import { leaveService } from '@/services/leave.service';
import { Spinner } from '@/components/ui/Spinner';
import { formatDate } from '@/utils/format';
import type { LeaveRequest } from '@/types';

interface CorrectionPreview {
  id: number;
  employeeName: string;
  reason: string;
}

export function ApprovalsPanel() {
  const [corrections, setCorrections] = useState<CorrectionPreview[]>([]);
  const [correctionTotal, setCorrectionTotal] = useState(0);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [corrRes, leaveRes] = await Promise.allSettled([
        correctionService.list({ status: 'pending', limit: 3 }),
        leaveService.pendingForHR(),
      ]);
      if (cancelled) return;

      if (corrRes.status === 'fulfilled') {
        const payload = corrRes.value?.data ?? {};
        setCorrections(
          (payload.items ?? []).map((c: any) => ({
            id: c.id,
            employeeName: c.employee?.fullName ?? `#${c.employeeId}`,
            reason: c.reason,
          })),
        );
        setCorrectionTotal(payload.total ?? 0);
      }
      if (leaveRes.status === 'fulfilled') {
        setLeaves(leaveRes.value ?? []);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const totalPending = correctionTotal + leaves.length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-800">Cần duyệt</h3>
        <span className="text-xs text-gray-400">{loading ? '…' : `${totalPending} mục`}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-6 py-8 text-sm text-gray-400">
          <Spinner className="h-4 w-4" /> Đang tải…
        </div>
      ) : totalPending === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-gray-400">Không có yêu cầu nào đang chờ duyệt.</div>
      ) : (
        <>
          {correctionTotal > 0 && (
            <div className="border-b border-gray-50 py-2">
              <div className="flex items-center justify-between px-6 py-2">
                <span className="text-sm font-semibold text-gray-700">Yêu cầu điều chỉnh chấm công</span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-50 px-1.5 text-xs font-bold text-amber-600">
                  {correctionTotal}
                </span>
              </div>
              {corrections.map((c) => (
                <div key={c.id} className="flex items-start gap-2 px-6 py-1.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{c.employeeName}</p>
                    <p className="truncate text-xs text-gray-400">{c.reason}</p>
                  </div>
                </div>
              ))}
              <a
                href="/corrections"
                className="mx-6 mt-2 block rounded-lg border border-dashed border-gray-200 py-2 text-center text-xs font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
              >
                Xem cả {correctionTotal} yêu cầu →
              </a>
            </div>
          )}

          {leaves.length > 0 && (
            <div className="py-2">
              <div className="flex items-center justify-between px-6 py-2">
                <span className="text-sm font-semibold text-gray-700">Đơn xin nghỉ phép</span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-50 px-1.5 text-xs font-bold text-amber-600">
                  {leaves.length}
                </span>
              </div>
              {leaves.slice(0, 3).map((lv) => (
                <div key={lv.id} className="flex items-start gap-2 px-6 py-1.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{lv.employee?.fullName ?? `#${lv.employeeId}`}</p>
                    <p className="truncate text-xs text-gray-400">
                      {formatDate(lv.fromDate)}
                      {lv.fromDate !== lv.toDate && ` → ${formatDate(lv.toDate)}`} · {lv.days} ngày
                    </p>
                  </div>
                </div>
              ))}
              <a
                href="/leave"
                className="mx-6 mt-2 block rounded-lg border border-dashed border-gray-200 py-2 text-center text-xs font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
              >
                Xem cả {leaves.length} đơn →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
