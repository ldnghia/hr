'use client';

import { useState, useEffect } from 'react';
import { Modal, Select, Segmented, DatePicker, Input, Alert } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { leaveService } from '@/services/leave.service';
import api from '@/lib/axios';
import type { LeaveBalance } from '@/types';

const { TextArea } = Input;

interface CreateLeaveModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workingMode?: 'FIXED' | 'SHIFT';
}

type LeaveTypeValue = 'annual' | 'sick' | 'unpaid' | 'compensatory';

interface ShiftOption {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
}

interface FormState {
  leaveType: LeaveTypeValue;
  isHalfDay: boolean;
  halfDaySession: 'first' | 'last';
  shiftId: number | null;
  fromDate: string;
  toDate: string;
  reason: string;
}

const INITIAL: FormState = {
  leaveType: 'annual',
  isHalfDay: false,
  halfDaySession: 'last',
  shiftId: null,
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

export function CreateLeaveModal({ open, onClose, onSuccess, workingMode }: CreateLeaveModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);

  const isCC = workingMode === 'SHIFT';

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
    setShifts([]);
    leaveService.balance().then((d) => setBalance(d.balance)).catch(() => {});
  }, [open]);

  // When CC + half-day + date selected → fetch shifts for that date
  useEffect(() => {
    if (!isCC || !form.isHalfDay || !form.fromDate) {
      setShifts([]);
      setForm((f) => ({ ...f, shiftId: null }));
      return;
    }
    setShiftsLoading(true);
    api
      .get<{ data: Array<{ shift: ShiftOption }> }>(`/shift-schedules/me/date?date=${form.fromDate}`)
      .then((res: { data: { data: Array<{ shift: ShiftOption }> } | Array<{ shift: ShiftOption }> }) => {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw as { data: Array<{ shift: ShiftOption }> }).data ?? [];
        const shiftList = list.map((s) => s.shift);
        setShifts(shiftList);
        // Auto-select first shift
        if (shiftList.length > 0) {
          setForm((f) => ({ ...f, shiftId: shiftList[0].id }));
        }
      })
      .catch(() => setShifts([]))
      .finally(() => setShiftsLoading(false));
  }, [isCC, form.isHalfDay, form.fromDate]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'isHalfDay' && value === true) {
        next.toDate = next.fromDate;
      }
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

  async function handleSubmit() {
    if (!validate()) return;
    setApiError('');
    setLoading(true);
    try {
      await leaveService.create({
        leaveType:      form.leaveType,
        fromDate:       form.fromDate,
        toDate:         form.isHalfDay ? form.fromDate : form.toDate,
        isHalfDay:      form.isHalfDay,
        halfDaySession: form.isHalfDay ? form.halfDaySession : undefined,
        shiftId:        form.isHalfDay && isCC && form.shiftId ? form.shiftId : undefined,
        reason:         form.reason,
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

  const toDayjs = (val: string) => (val ? dayjs(val) : null);
  const fromDatePicker = (setter: (v: string) => void) => (val: Dayjs | null) => setter(val ? val.format('YYYY-MM-DD') : '');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('leave.newRequest', 'Tạo yêu cầu nghỉ phép')}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText={t('leave.submitRequest', 'Gửi yêu cầu')}
      cancelText={t('common.cancel', 'Hủy')}
      okButtonProps={{ disabled: willExceed }}
    >
      <div className="space-y-4">
        {apiError && <Alert type="error" title={apiError} />}

        {/* Balance hint */}
        {balance && needsBalance && (
          <Alert
            type={willExceed ? 'error' : 'info'}
            title={
              <span>
                <span className="font-medium">{t('leave.balanceHint', 'Số ngày còn lại:')}</span>{' '}
                <span className="font-bold">{Number(balance.remaining)}</span>{' '}
                {`/ ${Number(balance.total)} ${t('leave.days', 'ngày')}`}
                {requestedDays > 0 && (
                  <>
                    {' '}— {t('leave.requesting', { n: requestedDays })}
                    {willExceed && ` ${t('leave.exceedsBalance', '(vượt quá số ngày phép)')}`}
                  </>
                )}
              </span>
            }
          />
        )}

        {/* Leave type */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('leave.leaveType', 'Loại nghỉ')}</label>
          <Select
            value={form.leaveType}
            options={LEAVE_TYPE_OPTIONS}
            className="w-full"
            onChange={(val) => set('leaveType', val as LeaveTypeValue)}
          />
        </div>

        {/* Full day / Half day toggle */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">{t('leave.dayType', 'Thời gian nghỉ')}</p>
          <Segmented
            block
            value={form.isHalfDay ? 'half' : 'full'}
            onChange={(val) => set('isHalfDay', val === 'half')}
            options={[
              { value: 'full', label: t('leave.fullDay', 'Cả ngày') },
              { value: 'half', label: `${t('leave.halfDay', 'Nửa ngày')} (0.5)` },
            ]}
          />
        </div>

        {/* Date fields */}
        {form.isHalfDay ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('leave.date', 'Ngày nghỉ')}</label>
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                value={toDayjs(form.fromDate)}
                onChange={fromDatePicker((v) => set('fromDate', v))}
              />
              {errors.fromDate && <p className="mt-1 text-xs text-red-500">{errors.fromDate}</p>}
            </div>

            {/* CC: shift picker + first/last session — FIXED: first/last session toggle */}
            {isCC ? (
              <>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('leave.shift', 'Ca nghỉ')}
                  </label>
                  {shiftsLoading ? (
                    <p className="text-sm text-gray-400">{t('common.loading', 'Đang tải...')}</p>
                  ) : shifts.length === 0 && form.fromDate ? (
                    <p className="text-sm text-amber-600">
                      {t('leave.noShiftsOnDate', 'Không có ca làm việc trong ngày này')}
                    </p>
                  ) : (
                    <Segmented
                      value={form.shiftId ?? undefined}
                      onChange={(val) => set('shiftId', val as number)}
                      options={shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` }))}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('leave.halfDaySession', 'Thời điểm nghỉ')}
                  </label>
                  <Segmented
                    block
                    value={form.halfDaySession}
                    onChange={(val) => set('halfDaySession', val as 'first' | 'last')}
                    options={[
                      { value: 'first', label: t('leave.halfDayFirst', 'Nửa ca đầu') },
                      { value: 'last', label: t('leave.halfDayLast', 'Nửa ca cuối') },
                    ]}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  {t('leave.halfDaySession', 'Thời điểm nghỉ')}
                </label>
                <Segmented
                  block
                  value={form.halfDaySession}
                  onChange={(val) => set('halfDaySession', val as 'first' | 'last')}
                  options={[
                    { value: 'first', label: t('leave.halfDayFirst', 'Nửa ca đầu') },
                    { value: 'last', label: t('leave.halfDayLast', 'Nửa ca cuối') },
                  ]}
                />
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('leave.fromDate', 'Từ ngày')}</label>
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                value={toDayjs(form.fromDate)}
                onChange={fromDatePicker((v) => set('fromDate', v))}
              />
              {errors.fromDate && <p className="mt-1 text-xs text-red-500">{errors.fromDate}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('leave.toDate', 'Đến ngày')}</label>
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                value={toDayjs(form.toDate)}
                minDate={form.fromDate ? dayjs(form.fromDate) : undefined}
                onChange={fromDatePicker((v) => set('toDate', v))}
              />
              {errors.toDate && <p className="mt-1 text-xs text-red-500">{errors.toDate}</p>}
            </div>
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
          <TextArea
            value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
            rows={3}
            placeholder={t('leave.reasonPlaceholder', 'Nhập lý do nghỉ phép...')}
          />
          {errors.reason && <p className="text-xs text-red-500">{errors.reason}</p>}
        </div>
      </div>
    </Modal>
  );
}
