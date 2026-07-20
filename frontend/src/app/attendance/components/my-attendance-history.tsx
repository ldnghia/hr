'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { attendanceService } from '@/services/attendance.service';
import { formatDate, formatDateTime, formatHours } from '@/utils/format';
import { AttendanceHistoryTable, WfmBadges } from './attendance-history-table';
import { CorrectionRequestFormModal } from './correction-request-form-modal';
import { AdminEditAttendanceModal } from './admin-edit-attendance-modal';
import type { AttendanceRecord, PaginatedResponse } from '@/types';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface MyAttendanceHistoryProps {
  isAdminOrHr: boolean;
  onAdminEditSuccess?: () => void;
  /** Increment to force a data reload (e.g. after check-in/out) */
  refreshKey?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MyAttendanceHistory({ isAdminOrHr, onAdminEditSuccess, refreshKey }: MyAttendanceHistoryProps) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<PaginatedResponse<AttendanceRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const { page, limit, next, prev } = usePagination(10);
  const [correctionTarget, setCorrectionTarget] = useState<AttendanceRecord | null>(null);
  const [adminEditTarget, setAdminEditTarget] = useState<AttendanceRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await attendanceService.me({ page, limit });
      setRecords(data);
    } catch (err) {
      console.error('[MyAttendanceHistory] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  // Reload when page/limit changes OR when refreshKey increments (checkin/checkout)
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-800">{t('attendance.myHistory')}</h3>
      </div>

      {loading ? <PageSpinner /> : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-gray-50">
            {records?.data.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-gray-400">{t('attendance.noRecordsYet')}</p>
            )}
            {records?.data.map((rec) => (
              <div key={rec.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-sm">{formatDate(rec.checkinTime ?? rec.date)}</span>
                  <span className="font-bold text-indigo-600 text-sm">{formatHours(rec.workingHours)}</span>
                </div>
                {rec.shift && (
                  <p className="text-xs text-gray-500">
                    {rec.shift.name}
                    <span className="ml-1 text-gray-400">{rec.shift.startTime}–{rec.shift.endTime}</span>
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-emerald-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase text-emerald-500 mb-0.5">{t('attendance.checkinLabel')}</p>
                    <p className="font-medium text-gray-700">
                      {rec.checkinTime ? formatDateTime(rec.checkinTime).split(' ')[1] : '--:--'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-orange-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase text-orange-500 mb-0.5">{t('attendance.checkoutLabel')}</p>
                    <p className="font-medium text-gray-700">
                      {rec.checkoutTime ? formatDateTime(rec.checkoutTime).split(' ')[1] : '--:--'}
                    </p>
                  </div>
                </div>
                <WfmBadges record={rec} />
                {(rec.checkinNote || rec.checkoutNote || rec.lateReason || rec.earlyReason) && (
                  <div className="space-y-1 text-[11px] text-gray-500">
                    {rec.checkinNote && <p className="bg-gray-50 rounded px-2 py-1"><span className="font-semibold text-gray-400">IN:</span> {rec.checkinNote}</p>}
                    {rec.checkoutNote && <p className="bg-gray-50 rounded px-2 py-1"><span className="font-semibold text-gray-400">OUT:</span> {rec.checkoutNote}</p>}
                    {rec.lateReason && <p className="bg-red-50 rounded px-2 py-1"><span className="font-semibold text-red-400">Trễ:</span> {rec.lateReason}</p>}
                    {rec.earlyReason && <p className="bg-blue-50 rounded px-2 py-1"><span className="font-semibold text-blue-400">Sớm:</span> {rec.earlyReason}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <AttendanceHistoryTable
            records={records?.data ?? []}
            isAdminOrHr={isAdminOrHr}
            onRequestCorrection={setCorrectionTarget}
            onAdminEdit={setAdminEditTarget}
          />

          {records && records.meta.totalPages > 1 && (
            <Pagination
              page={page} totalPages={records.meta.totalPages}
              total={records.meta.total} limit={limit}
              onPrev={prev} onNext={next}
            />
          )}
        </>
      )}

      {correctionTarget && (
        <CorrectionRequestFormModal
          attendance={correctionTarget}
          isOpen={!!correctionTarget}
          onClose={() => setCorrectionTarget(null)}
          onSuccess={() => { setCorrectionTarget(null); load(); }}
        />
      )}

      {adminEditTarget && (
        <AdminEditAttendanceModal
          attendance={adminEditTarget}
          isOpen={!!adminEditTarget}
          onClose={() => setAdminEditTarget(null)}
          onSuccess={() => { setAdminEditTarget(null); load(); onAdminEditSuccess?.(); }}
        />
      )}
    </div>
  );
}
