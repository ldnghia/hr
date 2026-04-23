'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from 'react-i18next';
import { leaveService } from '@/services/leave.service';
import type { LeaveBalance } from '@/types';

interface CreateLeaveModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type LeaveTypeValue = 'annual' | 'sick' | 'unpaid' | 'compensatory';

interface FormState {
  leaveType: LeaveTypeValue;
  isHalfDay: boolean;
  fromDate: string;
  toDate: string;
  reason: string;
}

const INITIAL: FormState = {
  leaveType: 'annual',
  isHalfDay: false,
  fromDate: '',
  toDate: '',
  reason: '',
};

/** Count business days (Mon–Fri) between two date strings, inclusive. */
function countBusinessDays(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  let count = 0;
  const cursor = new Date(from);
  const end = new Date(to);
  while (cursor <= end) {
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Types that do NOT deduct from annual leave balance */
const NO_BALANCE_TYPES: LeaveTypeValue[] = ['unpaid', 'compensatory'];

export function CreateLeaveModal({ open, onClose, onSuccess }: CreateLeaveModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);

  const LEAVE_TYPE_OPTIONS = [
    { value: 'annual',       label: t('leave.annual',       'Nghỉ phép năm') },
    { value: 'sick',         label: t('leave.sick',         'Nghỉ bệnh') },
    { value: 'compensatory', label: t('leave.compensatory', 'Nghỉ bù') },
    { value: 'unpaid',       label: t('leave.unpaid',       'Nghỉ không lương') },
  ];

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL);
    setErrors({});
    setApiError('');
    leaveService.balance().then((d) => setBalance(d.balance)).catch(() => {});
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // When switching to half-day, sync toDate = fromDate
      if (key === 'isHalfDay' && value === true) {
        next.toDate = next.fromDate;
      }
      // When fromDate changes in half-day mode, keep toDate in sync
      if (key === 'fromDate' && f.isHalfDay) {
        next.toDate = value as string;
      }
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.fromDate) errs.fromDate = t('validation.fromDateRequired', 'Vui lòng chọn ngày bắt đầu');
    if (!form.isHalfDay) {
      if (!form.toDate) errs.toDate = t('validation.toDateRequired', 'Vui lòng chọn ngày kết thúc');
      else if (form.fromDate && form.toDate < form.fromDate)
        errs.toDate = t('validation.toDateAfterFrom', 'Ngày kết thúc phải sau ngày bắt đầu');
    }
    if (!form.reason.trim()) errs.reason = t('validation.reasonRequired', 'Vui lòng nhập lý do');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setApiError('');
    setLoading(true);
    try {
      await leaveService.create({
        leaveType: form.leaveType,
        fromDate:  form.fromDate,
        toDate:    form.isHalfDay ? form.fromDate : form.toDate,
        isHalfDay: form.isHalfDay,
        reason:    form.reason,
      });
      setForm(INITIAL);
      onSuccess();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setApiError(Array.isArray(msg) ? msg[0] : (msg ?? t('leave.failedToSubmit', 'Gửi yêu cầu thất bại')));
    } finally {
      setLoading(false);
    }
  }

  const needsBalance = !NO_BALANCE_TYPES.includes(form.leaveType);
  const requestedDays = form.isHalfDay ? 0.5 : countBusinessDays(form.fromDate, form.toDate);
  const remaining = balance ? Number(balance.remaining) : null;
  const willExceed = needsBalance && remaining !== null && requestedDays > 0 && requestedDays > remaining;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('leave.newRequest', 'Tạo yêu cầu nghỉ phép')}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel', 'Hủy')}
          </Button>
          <Button form="create-leave-form" type="submit" loading={loading} disabled={willExceed}>
            {t('leave.submitRequest', 'Gửi yêu cầu')}
          </Button>
        </>
      }
    >
      <form id="create-leave-form" onSubmit={handleSubmit} className="space-y-4">
        {apiError && <Alert message={apiError} />}

        {/* Balance hint */}
        {balance && needsBalance && (
          <div className={[
            'rounded-lg px-4 py-3 text-sm',
            willExceed
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-indigo-50 border border-indigo-100 text-indigo-700',
          ].join(' ')}>
            <span className="font-medium">{t('leave.balanceHint', 'Số ngày còn lại:')}</span>{' '}
            <span className="font-bold">{Number(balance.remaining)}</span>{' '}
            {`/ ${Number(balance.total)} ${t('leave.days', 'ngày')}`}
            {requestedDays > 0 && (
              <>
                {' '}— {t('leave.requesting', { n: requestedDays })}
                {willExceed && ` ${t('leave.exceedsBalance', '(vượt quá số ngày phép)')}`}
              </>
            )}
          </div>
        )}

        {/* Leave type */}
        <Select
          label={t('leave.leaveType', 'Loại nghỉ')}
          value={form.leaveType}
          options={LEAVE_TYPE_OPTIONS}
          onChange={(e) => set('leaveType', e.target.value as LeaveTypeValue)}
        />

        {/* Full day / Half day toggle */}
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">
            {t('leave.dayType', 'Thời gian nghỉ')}
          </p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => set('isHalfDay', false)}
              className={[
                'flex-1 py-2 text-center font-medium transition-colors',
                !form.isHalfDay
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {t('leave.fullDay', 'Cả ngày')}
            </button>
            <button
              type="button"
              onClick={() => set('isHalfDay', true)}
              className={[
                'flex-1 py-2 text-center font-medium transition-colors border-l border-gray-200',
                form.isHalfDay
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {t('leave.halfDay', 'Nửa ngày')} <span className="text-xs opacity-75">(0.5)</span>
            </button>
          </div>
        </div>

        {/* Date fields */}
        {form.isHalfDay ? (
          <Input
            label={t('leave.date', 'Ngày nghỉ')}
            type="date"
            value={form.fromDate}
            onChange={(e) => set('fromDate', e.target.value)}
            error={errors.fromDate}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('leave.fromDate', 'Từ ngày')}
              type="date"
              value={form.fromDate}
              onChange={(e) => set('fromDate', e.target.value)}
              error={errors.fromDate}
            />
            <Input
              label={t('leave.toDate', 'Đến ngày')}
              type="date"
              value={form.toDate}
              min={form.fromDate}
              onChange={(e) => set('toDate', e.target.value)}
              error={errors.toDate}
            />
          </div>
        )}

        {/* Days summary */}
        {requestedDays > 0 && (
          <p className="text-xs text-gray-500">
            {t('common.daysSelected', { n: requestedDays })}
          </p>
        )}

        {/* Reason */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            {t('leave.reason', 'Lý do')} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
            rows={3}
            placeholder={t('leave.reasonPlaceholder', 'Nhập lý do nghỉ phép...')}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
          {errors.reason && <p className="text-xs text-red-500">{errors.reason}</p>}
        </div>
      </form>
    </Modal>
  );
}
