'use client';

import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/utils/format';
import type { MultipleOpenSessionsError } from '@/services/attendance.service';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CheckoutShiftPickerModalProps {
  open: boolean;
  openSessions: MultipleOpenSessionsError['openSessions'];
  loading: boolean;
  onSelect: (shiftId: number) => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CheckoutShiftPickerModal({
  open,
  openSessions,
  loading,
  onSelect,
  onClose,
}: CheckoutShiftPickerModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('attendance.pickShiftToCheckout')}
      size="sm"
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          {t('attendance.multipleOpenSessionsMsg')}
        </p>

        {openSessions.map((s) => (
          <button
            key={s.shiftId}
            disabled={loading}
            onClick={() => onSelect(s.shiftId)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-gray-900">{s.shiftName}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('attendance.checkinLabel')}:{' '}
              {formatDateTime(s.checkinTime)}
            </p>
          </button>
        ))}

        <Button
          variant="ghost"
          className="w-full"
          onClick={onClose}
          disabled={loading}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </Modal>
  );
}
