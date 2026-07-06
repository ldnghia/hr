'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, DatePicker, Select, Input, Alert } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { correctionService, type CorrectionRequest } from '@/services/attendance-correction.service';
import { attendanceService } from '@/services/attendance.service';
import type { Shift } from '@/types';
import { formatDateTime } from '@/utils/format';

const { TextArea } = Input;

interface Props {
  request: CorrectionRequest;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormValues {
  shiftId?: number;
  checkinTime: Dayjs | null;
  checkoutTime: Dayjs | null;
  checkinNote: string;
  checkoutNote: string;
  reason: string;
}

export function CorrectionEditModal({ request, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm<FormValues>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const isShift = Boolean(request.originalShift);
  const date = request.attendance?.date?.slice(0, 10);

  // CC employees can pick a different shift for this day — fetch options once
  useEffect(() => {
    if (!isShift) return;
    attendanceService.shifts()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        setShifts(list);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShift]);

  const handleShiftChange = (id: number) => {
    const shift = shifts.find((s) => s.id === id);
    if (!shift || !date) return;
    form.setFieldValue('checkinTime', dayjs(`${date}T${shift.startTime}`));
    const [h] = shift.endTime.split(':').map(Number);
    // Cross-day shift: checkout is next day
    const checkoutDate = h < 6 ? dayjs(date).add(1, 'day').format('YYYY-MM-DD') : date;
    form.setFieldValue('checkoutTime', dayjs(`${checkoutDate}T${shift.endTime}`));
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      setLoading(true);
      setError('');
      await correctionService.update(request.id, {
        requestedCheckinTime: values.checkinTime?.toISOString(),
        requestedCheckoutTime: values.checkoutTime?.toISOString(),
        requestedCheckinNote: values.checkinNote,
        requestedCheckoutNote: values.checkoutNote,
        requestedShiftId: values.shiftId,
        reason: values.reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('attendance.failedToSubmitCorrection'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={t('attendance.editCorrectionTitle', 'Chỉnh sửa yêu cầu điều chỉnh')}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText={t('common.save', 'Lưu')}
      cancelText={t('common.cancel')}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          shiftId: request.requestedShiftId ?? request.originalShiftId ?? undefined,
          checkinTime: request.requestedCheckinTime ? dayjs(request.requestedCheckinTime) : null,
          checkoutTime: request.requestedCheckoutTime ? dayjs(request.requestedCheckoutTime) : null,
          checkinNote: request.requestedCheckinNote ?? '',
          checkoutNote: request.requestedCheckoutNote ?? '',
          reason: request.reason ?? '',
        }}
      >
        <p className="mb-3 text-sm text-gray-500">
          {t('attendance.correctionDate')}: <span className="font-medium text-gray-800">{date ?? '—'}</span>
        </p>

        {isShift && (
          <Form.Item name="shiftId" label={t('attendance.shiftLabel', 'Ca làm việc')}>
            <Select
              onSelect={handleShiftChange}
              options={shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime} — ${s.endTime})` }))}
            />
          </Form.Item>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Form.Item
            name="checkinTime"
            label={
              <span>
                {t('attendance.checkinTimeLabel')}{' '}
                <span className="text-gray-400">
                  ({t('attendance.originalLabel')}: {request.originalCheckinTime ? formatDateTime(request.originalCheckinTime) : '—'})
                </span>
              </span>
            }
          >
            <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
          </Form.Item>
          <Form.Item
            name="checkoutTime"
            label={
              <span>
                {t('attendance.checkoutTimeLabel')}{' '}
                <span className="text-gray-400">
                  ({t('attendance.originalLabel')}: {request.originalCheckoutTime ? formatDateTime(request.originalCheckoutTime) : '—'})
                </span>
              </span>
            }
          >
            <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
          </Form.Item>
        </div>

        <Form.Item name="checkinNote" label={t('attendance.checkinNoteLabel')}>
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item name="checkoutNote" label={t('attendance.checkoutNoteLabel')}>
          <Input maxLength={500} />
        </Form.Item>

        <Form.Item
          name="reason"
          label={t('attendance.reasonLabel')}
          rules={[{ required: true, message: t('attendance.reasonRequired') }]}
        >
          <TextArea rows={3} maxLength={1000} placeholder={t('attendance.reasonPlaceholder')} />
        </Form.Item>

        {error && <Alert type="error" title={error} className="mb-2" />}
      </Form>
    </Modal>
  );
}
