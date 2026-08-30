'use client';

import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Pencil, Wrench } from 'lucide-react';
import { DataTable } from '@/components/antd/data-table';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatDateTime, formatHours, formatDistanceKm } from '@/utils/format';
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
      {(record as any).forgotCheckout && <Badge label={t('attendance.forgotCheckout')} variant="warning" />}
      {record.isCorrected && <Badge label={t('attendance.corrected')} variant="neutral" />}
      {latestCorrection?.status === 'pending' && <Badge label={t('attendance.correctionPending')} variant="warning" />}
      {latestCorrection?.status === 'rejected' && <Badge label={t('attendance.correctionRejected')} variant="danger" />}
    </div>
  );
}

// ─── Office in/out badge ──────────────────────────────────────────────────────

function OfficeBadge({ label, inOffice, distanceM, hint }: { label: string; inOffice: boolean; distanceM?: number | null; hint: string }) {
  return (
    <span
      title={distanceM != null ? `${hint} · ${formatDistanceKm(distanceM)}` : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        inOffice ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      }`}
    >
      {label}
      {distanceM != null && ` (${formatDistanceKm(distanceM)})`}
    </span>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface AttendanceHistoryTableProps {
  records: AttendanceRecord[];
  isAdminOrHr: boolean;
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
  onRequestCorrection: (rec: AttendanceRecord) => void;
  onAdminEdit: (rec: AttendanceRecord) => void;
}

// ─── Desktop table ────────────────────────────────────────────────────────────

export function AttendanceHistoryTable({
  records,
  isAdminOrHr,
  page,
  limit,
  total,
  onPageChange,
  onRequestCorrection,
  onAdminEdit,
}: AttendanceHistoryTableProps) {
  const { t } = useTranslation();

  const columns: ColumnsType<AttendanceRecord> = [
    {
      title: t('common.date'),
      key: 'date',
      render: (_, rec) => <span className="whitespace-nowrap text-gray-700">{formatDate(rec.checkinTime ?? rec.date)}</span>,
    },
    {
      title: t('attendance.shiftLabel'),
      key: 'shift',
      responsive: ['md'],
      render: (_, rec) => (
        <span className="text-xs text-gray-500">
          {rec.shift ? rec.shift.name : '—'}
          {rec.shift && <span className="block text-gray-400">{rec.shift.startTime}–{rec.shift.endTime}</span>}
        </span>
      ),
    },
    {
      title: t('attendance.checkinLabel'),
      key: 'checkin',
      render: (_, rec) => <span className="whitespace-nowrap text-gray-600">{formatDateTime(rec.checkinTime)}</span>,
    },
    {
      title: t('attendance.checkoutLabel'),
      key: 'checkout',
      render: (_, rec) => <span className="whitespace-nowrap text-gray-600">{formatDateTime(rec.checkoutTime)}</span>,
    },
    {
      title: t('reports.colHours'),
      key: 'hours',
      responsive: ['md'],
      render: (_, rec) => <span className="whitespace-nowrap font-medium text-indigo-600">{formatHours(rec.workingHours)}</span>,
    },
    {
      title: t('common.status'),
      key: 'status',
      render: (_, rec) => (
        <div className="flex flex-wrap items-center gap-1">
          <WfmBadges record={rec} />
          {rec.checkinLat != null && (
            <OfficeBadge
              label={`IN: ${rec.isInOffice ? t('attendance.inOfficeLabel') : t('attendance.outsideLabel')}`}
              inOffice={!!rec.isInOffice}
              distanceM={rec.officeDistanceM}
              hint={t('attendance.checkinLabel')}
            />
          )}
          {rec.checkoutTime && rec.checkoutLat != null && (
            <OfficeBadge
              label={`OUT: ${rec.checkoutIsInOffice ? t('attendance.inOfficeLabel') : t('attendance.outsideLabel')}`}
              inOffice={!!rec.checkoutIsInOffice}
              distanceM={rec.checkoutOfficeDistanceM}
              hint={t('attendance.checkoutLabel')}
            />
          )}
        </div>
      ),
    },
    {
      title: t('common.notes'),
      key: 'notes',
      responsive: ['xl'],
      render: (_, rec) => (
        <div className="flex max-w-[200px] flex-col gap-1 text-[10px] text-gray-500">
          {rec.checkinNote && <div className="rounded bg-gray-50 p-1"><span className="font-bold text-gray-400">IN:</span> {rec.checkinNote}</div>}
          {rec.checkoutNote && <div className="rounded bg-gray-50 p-1"><span className="font-bold text-gray-400">OUT:</span> {rec.checkoutNote}</div>}
          {rec.lateReason && <div className="rounded bg-red-50 p-1"><span className="font-bold text-red-400">Trễ:</span> {rec.lateReason}</div>}
          {rec.earlyReason && <div className="rounded bg-blue-50 p-1"><span className="font-bold text-blue-400">Sớm:</span> {rec.earlyReason}</div>}
          {!rec.checkinNote && !rec.checkoutNote && !rec.lateReason && !rec.earlyReason && (
            <span className="text-[9px] uppercase italic tracking-widest text-gray-300">{t('common.noData')}</span>
          )}
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'center',
      width: isAdminOrHr ? 96 : 60,
      render: (_, rec) => (
        <div className="flex flex-col items-center gap-1.5">
          {rec.isCorrected && <CorrectedBadge correctionRequestId={rec.correctionRequestId} />}
          <div className="flex justify-center gap-1.5 whitespace-nowrap">
            <Button
              size="small"
              color="blue"
              variant="outlined"
              icon={<Pencil size={14} />}
              title={t('attendance.requestCorrectionBtn')}
              aria-label={t('attendance.requestCorrectionBtn')}
              onClick={() => onRequestCorrection(rec)}
            />
            {isAdminOrHr && (
              <Button
                size="small"
                color="purple"
                variant="outlined"
                icon={<Wrench size={14} />}
                title={t('attendance.adminEdit')}
                aria-label={t('attendance.adminEdit')}
                onClick={() => onAdminEdit(rec)}
              />
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="hidden sm:block">
      <DataTable<AttendanceRecord>
        bordered
        rowKey="id"
        columns={columns}
        dataSource={records}
        page={page}
        pageSize={limit}
        total={total}
        onPageChange={onPageChange}
        pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        locale={{ emptyText: t('attendance.noRecordsYet') }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}
