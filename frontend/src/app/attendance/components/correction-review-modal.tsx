'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Alert, Button } from 'antd';
import { correctionService, type CorrectionRequest } from '@/services/attendance-correction.service';
import { formatDateTime } from '@/utils/format';

const { TextArea } = Input;

interface Props {
  request: CorrectionRequest;
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function DiffRow({ label, original, requested }: { label: string; original?: string | null; requested?: string | null }) {
  if (!requested) return null;
  return (
    <tr>
      <td className="py-1 pr-4 text-xs font-medium text-gray-500">{label}</td>
      <td className="py-1 pr-4 text-xs text-gray-400 line-through">{original ?? '—'}</td>
      <td className="py-1 text-xs font-medium text-blue-700">{requested}</td>
    </tr>
  );
}

export function CorrectionReviewModal({ request, isOpen = true, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  const handleApprove = async () => {
    try {
      setLoading('approve');
      setError('');
      await correctionService.approve(request.id, reviewNote || undefined);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('attendance.failedToApprove'));
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    if (!reviewNote.trim()) { setError(t('attendance.reviewNoteRequired')); return; }
    try {
      setLoading('reject');
      setError('');
      await correctionService.reject(request.id, reviewNote);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('attendance.failedToReject'));
    } finally {
      setLoading(null);
    }
  };

  return (
    <Modal
      open={isOpen}
      title={t('attendance.reviewCorrectionTitle', { id: request.id })}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose} disabled={!!loading}>
          {t('common.close')}
        </Button>,
        <Button key="reject" danger onClick={handleReject} loading={loading === 'reject'} disabled={loading === 'approve'}>
          {t('attendance.reject')}
        </Button>,
        <Button key="approve" type="primary" onClick={handleApprove} loading={loading === 'approve'} disabled={loading === 'reject'}>
          {t('attendance.approve')}
        </Button>,
      ]}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <p><span className="font-medium">{t('attendance.employeeLabel')}:</span> {request.employee?.fullName ?? '—'} ({request.employee?.code})</p>
          <p><span className="font-medium">{t('attendance.correctionDate')}:</span> {request.attendance?.date?.slice(0, 10)}</p>
          {request.originalShift && (
            <p><span className="font-medium">{t('attendance.shiftLabel', 'Ca làm việc')}:</span> {request.originalShift.name} ({request.originalShift.startTime} — {request.originalShift.endTime})</p>
          )}
          <p className="mt-1"><span className="font-medium">{t('attendance.reasonLabel')}:</span> {request.reason}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">{t('attendance.requestedChanges')}</p>
          <table className="w-full">
            <thead>
              <tr>
                <th className="pb-1 text-left text-xs text-gray-400">{t('attendance.fieldLabel')}</th>
                <th className="pb-1 text-left text-xs text-gray-400">{t('attendance.originalValue')}</th>
                <th className="pb-1 text-left text-xs text-gray-400">{t('attendance.requestedValue')}</th>
              </tr>
            </thead>
            <tbody>
              {(request.requestedShift || request.requestedShiftId) && (
                <DiffRow
                  label="Ca làm việc"
                  original={request.originalShift
                    ? `${request.originalShift.name} (${request.originalShift.startTime} — ${request.originalShift.endTime})`
                    : (request.originalShiftId ? `Ca #${request.originalShiftId}` : '—')}
                  requested={request.requestedShift
                    ? `${request.requestedShift.name} (${request.requestedShift.startTime} — ${request.requestedShift.endTime})`
                    : `Ca #${request.requestedShiftId}`}
                />
              )}
              <DiffRow
                label={t('attendance.checkinLabel2')}
                original={request.originalCheckinTime ? formatDateTime(request.originalCheckinTime) : '—'}
                requested={request.requestedCheckinTime ? formatDateTime(request.requestedCheckinTime) : null}
              />
              <DiffRow
                label={t('attendance.checkoutLabel2')}
                original={request.originalCheckoutTime ? formatDateTime(request.originalCheckoutTime) : '—'}
                requested={request.requestedCheckoutTime ? formatDateTime(request.requestedCheckoutTime) : null}
              />
              <DiffRow label={t('attendance.checkinNoteField')} original={request.originalCheckinNote} requested={request.requestedCheckinNote} />
              <DiffRow label={t('attendance.checkoutNoteField')} original={request.originalCheckoutNote} requested={request.requestedCheckoutNote} />
            </tbody>
          </table>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {t('attendance.reviewNoteLabel')} <span className="text-gray-400">({t('attendance.requiredForRejection')})</span>
          </label>
          <TextArea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t('attendance.reviewNotePlaceholder')}
          />
        </div>

        {error && <Alert type="error" title={error} />}
      </div>
    </Modal>
  );
}
