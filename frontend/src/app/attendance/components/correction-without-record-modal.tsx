'use client';

/**
 * CorrectionWithoutRecordModal — create a correction request for a date
 * that has no existing attendance record. Sends `date` instead of `attendanceId`.
 * The backend will auto-create an empty attendance record then attach the correction.
 *
 * For SHIFT (CC) employees: a shift selector is shown and required.
 */
import { useEffect, useState } from 'react';
import { Modal, Form, DatePicker, Select, Input, Alert } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { correctionService } from '@/services/attendance-correction.service';
import { attendanceService } from '@/services/attendance.service';
import type { Shift } from '@/types';

const { TextArea } = Input;

interface Props {
  date: string;        // YYYY-MM-DD
  workingMode: string; // 'FIXED' | 'SHIFT'
  onClose: () => void;
  onSuccess: () => void;
}

interface FormValues {
  shiftId?: number;
  checkinTime: Dayjs | null;
  checkoutTime: Dayjs | null;
  reason: string;
}

export function CorrectionWithoutRecordModal({ date, workingMode, onClose, onSuccess }: Props) {
  const isShift = workingMode === 'SHIFT';
  const [form] = Form.useForm<FormValues>();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch available shifts for SHIFT employees
  useEffect(() => {
    if (!isShift) return;
    setShiftsLoading(true);
    attendanceService.shifts()
      .then((data) => {
        // `shifts()` may return raw array or wrapped — handle both
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        setShifts(list);
        if (list.length > 0) applyShift(list[0]);
      })
      .catch(() => {})
      .finally(() => setShiftsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShift]);

  const applyShift = (shift: Shift) => {
    form.setFieldValue('shiftId', shift.id);
    form.setFieldValue('checkinTime', dayjs(`${date}T${shift.startTime}`));
    const [h] = shift.endTime.split(':').map(Number);
    // Cross-day shift: checkout is next day
    const checkoutDate = h < 6 ? dayjs(date).add(1, 'day').format('YYYY-MM-DD') : date;
    form.setFieldValue('checkoutTime', dayjs(`${checkoutDate}T${shift.endTime}`));
  };

  const handleShiftChange = (id: number) => {
    const shift = shifts.find((s) => s.id === id);
    if (shift) applyShift(shift);
  };

  const handleSubmit = async (values: FormValues) => {
    setLoading(true); setError('');
    try {
      await correctionService.create({
        date,
        shiftId: isShift && values.shiftId ? Number(values.shiftId) : undefined,
        requestedCheckinTime: values.checkinTime ? values.checkinTime.toISOString() : undefined,
        requestedCheckoutTime: values.checkoutTime ? values.checkoutTime.toISOString() : undefined,
        requestedShiftId: isShift && values.shiftId ? Number(values.shiftId) : undefined,
        reason: values.reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Không thể tạo yêu cầu điều chỉnh.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title="Yêu cầu điều chỉnh — Chưa có bản ghi"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText="Gửi yêu cầu"
      cancelText="Huỷ"
    >
      <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
        <p className="text-xs font-semibold text-amber-700 mb-0.5">Ngày chưa có bản ghi</p>
        <p className="text-sm font-bold text-amber-900">{date}</p>
        <p className="text-xs text-amber-600 mt-1">
          Hệ thống sẽ tạo bản ghi chấm công mới dựa trên thông tin bạn cung cấp.
        </p>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          checkinTime: dayjs(`${date}T08:00`),
          checkoutTime: dayjs(`${date}T17:00`),
          reason: '',
        }}
      >
        {isShift && (
          <Form.Item
            name="shiftId"
            label="Ca làm việc"
            rules={[{ required: true, message: 'Vui lòng chọn ca làm việc.' }]}
          >
            <Select
              loading={shiftsLoading}
              placeholder="— Chọn ca làm việc —"
              onChange={handleShiftChange}
              options={shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime} — ${s.endTime})` }))}
            />
          </Form.Item>
        )}

        <Form.Item
          name="checkinTime"
          label="Giờ vào"
          rules={[{ required: true, message: 'Vui lòng nhập giờ vào.' }]}
        >
          <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
        </Form.Item>

        <Form.Item name="checkoutTime" label="Giờ ra">
          <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
        </Form.Item>

        <Form.Item
          name="reason"
          label="Lý do"
          rules={[{ required: true, message: 'Vui lòng nhập lý do điều chỉnh.' }]}
        >
          <TextArea rows={3} placeholder="Mô tả lý do cần điều chỉnh chấm công..." />
        </Form.Item>

        {error && <Alert type="error" title={error} className="mb-2" />}
      </Form>
    </Modal>
  );
}
