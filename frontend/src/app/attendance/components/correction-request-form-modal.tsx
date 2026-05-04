'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { correctionService, type CreateCorrectionPayload } from '@/services/attendance-correction.service';
import type { AttendanceRecord } from '@/types';
import { formatDateTime } from '@/utils/format';

interface Props {
  attendance: AttendanceRecord;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CorrectionRequestFormModal({ attendance, isOpen, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [checkinTime, setCheckinTime] = useState(
    attendance.checkinTime ? attendance.checkinTime.slice(0, 16) : '',
  );
  const [checkoutTime, setCheckoutTime] = useState(
    attendance.checkoutTime ? attendance.checkoutTime.slice(0, 16) : '',
  );
  const [checkinNote, setCheckinNote] = useState(attendance.checkinNote ?? '');
  const [checkoutNote, setCheckoutNote] = useState(attendance.checkoutNote ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setError(t('attendance.reasonRequired')); return; }

    const payload: CreateCorrectionPayload = {
      attendanceId: attendance.id,
      reason: reason.trim(),
    };
    if (checkinTime && checkinTime !== attendance.checkinTime?.slice(0, 16))
      payload.requestedCheckinTime = new Date(checkinTime).toISOString();
    if (checkoutTime && checkoutTime !== attendance.checkoutTime?.slice(0, 16))
      payload.requestedCheckoutTime = new Date(checkoutTime).toISOString();
    if (checkinNote !== (attendance.checkinNote ?? ''))
      payload.requestedCheckinNote = checkinNote;
    if (checkoutNote !== (attendance.checkoutNote ?? ''))
      payload.requestedCheckoutNote = checkoutNote;

    try {
      setLoading(true);
      setError('');
      await correctionService.create(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('attendance.failedToSubmitCorrection'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} title={t('attendance.requestCorrectionTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          {t('attendance.correctionDate')}: <span className="font-medium text-gray-800">{attendance.date?.slice(0, 10)}</span>
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('attendance.checkinTimeLabel')}
              <span className="ml-1 text-gray-400">
                ({t('attendance.originalLabel')}: {attendance.checkinTime ? formatDateTime(attendance.checkinTime) : '—'})
              </span>
            </label>
            <Input
              type="datetime-local"
              value={checkinTime}
              onChange={(e) => setCheckinTime(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('attendance.checkoutTimeLabel')}
              <span className="ml-1 text-gray-400">
                ({t('attendance.originalLabel')}: {attendance.checkoutTime ? formatDateTime(attendance.checkoutTime) : '—'})
              </span>
            </label>
            <Input
              type="datetime-local"
              value={checkoutTime}
              onChange={(e) => setCheckoutTime(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t('attendance.checkinNoteLabel')}</label>
          <Input
            value={checkinNote}
            onChange={(e) => setCheckinNote(e.target.value)}
            placeholder={t('attendance.checkinNotePlaceholder')}
            maxLength={500}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t('attendance.checkoutNoteLabel')}</label>
          <Input
            value={checkoutNote}
            onChange={(e) => setCheckoutNote(e.target.value)}
            placeholder={t('attendance.checkoutNotePlaceholder')}
            maxLength={500}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {t('attendance.reasonLabel')} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder={t('attendance.reasonPlaceholder')}
          />
        </div>

        {error && <Alert variant="error" message={error} />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('attendance.submitting') : t('attendance.submitRequest')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
