'use client';

import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface LateEarlyReasonModalProps {
  open: boolean;
  kind: 'late' | 'early' | null;
  value: string;
  error?: string;
  loading: boolean;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LateEarlyReasonModal({
  open,
  kind,
  value,
  error,
  loading,
  onChange,
  onConfirm,
  onCancel,
}: LateEarlyReasonModalProps) {
  const { t } = useTranslation();
  const isLate = kind === 'late';

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={isLate ? t('attendance.lateReasonTitle') : t('attendance.earlyReasonTitle')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} loading={loading} disabled={!value.trim()}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="text-sm text-gray-600">
          {isLate ? t('attendance.lateReasonLabel') : t('attendance.earlyReasonLabel')}
        </label>
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}
