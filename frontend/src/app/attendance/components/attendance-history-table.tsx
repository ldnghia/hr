'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatDateTime, formatHours } from '@/utils/format';
import { CorrectedBadge } from './corrected-badge';
import type { AttendanceRecord } from '@/types';

// ─── WFM badges ───────────────────────────────────────────────────────────────

export function WfmBadges({ record }: { record: AttendanceRecord }) {
  const { t } = useTranslation();
  const latestCorrection = record.corrections?.[0];
  return (
    <div className="flex flex-wrap gap-1">
      {record.isLate && <Badge label={t('attendance.late')} variant="danger" />}
      {record.isEarlyOut && <Badge label={t('attendance.earlyOut')} variant="warning" />}
      {record.isOvertime && <Badge label={`OT ${Number(record.overtimeHours).toFixed(1)}h`} variant="info" />}
      {!record.isLate && !record.isEarlyOut && !record.isOvertime && record.checkinTime && (
        <Badge label={t('attendance.onTime')} variant="success" />
      )}
      {record.isCorrected && <Badge label={t('attendance.corrected')} variant="neutral" />}
      {latestCorrection?.status === 'pending' && <Badge label={t('attendance.correctionPending')} variant="warning" />}
      {latestCorrection?.status === 'rejected' && <Badge label={t('attendance.correctionRejected')} variant="danger" />}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface AttendanceHistoryTableProps {
  records: AttendanceRecord[];
  isAdminOrHr: boolean;
  onRequestCorrection: (rec: AttendanceRecord) => void;
  onAdminEdit: (rec: AttendanceRecord) => void;
}

// ─── Desktop table ────────────────────────────────────────────────────────────

export function AttendanceHistoryTable({
  records,
  isAdminOrHr,
  onRequestCorrection,
  onAdminEdit,
}: AttendanceHistoryTableProps) {
  const { t } = useTranslation();

  return (
    <div className="hidden sm:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-6 py-3 text-left">{t('common.date')}</th>
            <th className="px-6 py-3 text-left">{t('attendance.shiftLabel')}</th>
            <th className="px-6 py-3 text-left">{t('attendance.checkinLabel')}</th>
            <th className="px-6 py-3 text-left">{t('attendance.checkoutLabel')}</th>
            <th className="px-6 py-3 text-left">{t('reports.colHours')}</th>
            <th className="px-6 py-3 text-left">{t('common.status')}</th>
            <th className="px-6 py-3 text-left">{t('common.notes')}</th>
            <th className="px-6 py-3 text-left">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {records.map((rec) => (
            <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-3 text-gray-700">{formatDate(rec.date)}</td>
              <td className="px-6 py-3 text-gray-500 text-xs">
                {rec.shift ? rec.shift.name : '—'}
                {rec.shift && <span className="block text-gray-400">{rec.shift.startTime}–{rec.shift.endTime}</span>}
              </td>
              <td className="px-6 py-3 text-gray-600">{formatDateTime(rec.checkinTime)}</td>
              <td className="px-6 py-3 text-gray-600">{formatDateTime(rec.checkoutTime)}</td>
              <td className="px-6 py-3 font-medium text-indigo-600">{formatHours(rec.workingHours)}</td>
              <td className="px-6 py-3">
                <div className="flex flex-wrap items-center gap-1">
                  <WfmBadges record={rec} />
                  {rec.isInOffice !== undefined && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      rec.isInOffice ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {rec.isInOffice ? t('attendance.inOfficeLabel') : t('attendance.outsideLabel')}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-3">
                <div className="flex flex-col gap-1 text-[10px] text-gray-500 max-w-[200px]">
                  {rec.checkinNote && <div className="bg-gray-50 p-1 rounded"><span className="font-bold text-gray-400">IN:</span> {rec.checkinNote}</div>}
                  {rec.checkoutNote && <div className="bg-gray-50 p-1 rounded"><span className="font-bold text-gray-400">OUT:</span> {rec.checkoutNote}</div>}
                  {!rec.checkinNote && !rec.checkoutNote && (
                    <span className="text-gray-300 italic uppercase tracking-widest text-[9px]">{t('common.noData')}</span>
                  )}
                </div>
              </td>
              <td className="px-6 py-3">
                <div className="flex flex-col gap-1">
                  {rec.isCorrected && <CorrectedBadge correctionRequestId={rec.correctionRequestId} />}
                  <Button size="sm" variant="ghost" onClick={() => onRequestCorrection(rec)}>
                    {t('attendance.requestCorrectionBtn')}
                  </Button>
                  {isAdminOrHr && (
                    <Button size="sm" variant="secondary" onClick={() => onAdminEdit(rec)}>
                      {t('attendance.adminEdit')}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-400">
                {t('attendance.noRecordsYet')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
