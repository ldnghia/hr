'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { correctionService, type AdminEditPayload } from '@/services/attendance-correction.service';
import type { AttendanceRecord } from '@/types';
import { formatDateTime } from '@/utils/format';

interface Props {
  attendance: AttendanceRecord;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminEditAttendanceModal({ attendance, isOpen, onClose, onSuccess }: Props) {
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

    const payload: AdminEditPayload = { reason: reason.trim() };
    if (checkinTime) payload.checkinTime = new Date(checkinTime).toISOString();
    if (checkoutTime) payload.checkoutTime = new Date(checkoutTime).toISOString();
    if (checkinNote) payload.checkinNote = checkinNote;
    if (checkoutNote) payload.checkoutNote = checkoutNote;

    try {
      setLoading(true);
      setError('');
      await correctionService.adminEdit(attendance.id, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? t('attendance.failedToUpdateAttendance'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} title={t('attendance.adminEditTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <p>
            <span className="font-medium">{t('attendance.correctionDate')}:</span>{' '}
            {attendance.date?.slice(0, 10)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {t('attendance.originalCheckin')}: {attendance.checkinTime ? formatDateTime(attendance.checkinTime) : '—'} ·
            {t('attendance.originalCheckout')}: {attendance.checkoutTime ? formatDateTime(attendance.checkoutTime) : '—'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('attendance.checkinTimeLabel')}</label>
            <Input
              type="datetime-local"
              value={checkinTime}
              onChange={(e) => setCheckinTime(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('attendance.checkoutTimeLabel')}</label>
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
            placeholder={t('attendance.checkinNotePlaceholderAdmin')}
            maxLength={500}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t('attendance.checkoutNoteLabel')}</label>
          <Input
            value={checkoutNote}
            onChange={(e) => setCheckoutNote(e.target.value)}
            placeholder={t('attendance.checkoutNotePlaceholderAdmin')}
            maxLength={500}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {t('attendance.reasonLabel')} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder={t('attendance.reasonForAdminEdit')}
          />
        </div>

        {error && <Alert variant="error" message={error} />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {t('attendance.saveChanges')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
