'use client';

/**
 * CorrectionWithoutRecordModal — create a correction request for a date
 * that has no existing attendance record. Sends `date` instead of `attendanceId`.
 * The backend will auto-create an empty attendance record then attach the correction.
 *
 * For SHIFT (CC) employees: a shift selector is shown and required.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { correctionService } from '@/services/attendance-correction.service';
import { attendanceService } from '@/services/attendance.service';
import type { Shift } from '@/types';

interface Props {
  date: string;        // YYYY-MM-DD
  workingMode: string; // 'FIXED' | 'SHIFT'
  onClose: () => void;
  onSuccess: () => void;
}

export function CorrectionWithoutRecordModal({ date, workingMode, onClose, onSuccess }: Props) {
  const isShift = workingMode === 'SHIFT';

  const [checkinTime, setCheckinTime]   = useState(`${date}T08:00`);
  const [checkoutTime, setCheckoutTime] = useState(`${date}T17:00`);
  const [reason, setReason]             = useState('');
  const [shiftId, setShiftId]           = useState<number | ''>('');
  const [shifts, setShifts]             = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  // Fetch available shifts for SHIFT employees
  useEffect(() => {
    if (!isShift) return;
    setShiftsLoading(true);
    attendanceService.shifts()
      .then((data) => {
        // `shifts()` may return raw array or wrapped — handle both
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        setShifts(list);
        // Pre-select first shift
        if (list.length > 0) setShiftId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setShiftsLoading(false));
  }, [isShift]);

  // Auto-fill default checkin/checkout from selected shift
  useEffect(() => {
    if (!isShift || !shiftId) return;
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    setCheckinTime(`${date}T${shift.startTime}`);
    const [h, m] = shift.endTime.split(':').map(Number);
    // Cross-day shift: checkout is next day
    const checkoutDate = h < 6 ? nextDay(date) : date;
    setCheckoutTime(`${checkoutDate}T${shift.endTime}`);
  }, [shiftId, shifts, date, isShift]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isShift && !shiftId) { setError('Vui lòng chọn ca làm việc.'); return; }
    if (!reason.trim())      { setError('Vui lòng nhập lý do điều chỉnh.'); return; }
    if (!checkinTime)        { setError('Vui lòng nhập giờ vào.'); return; }

    setLoading(true); setError('');
    try {
      await correctionService.create({
        date,
        // shiftId tells backend which attendance record to find/create for this shift
        shiftId: isShift && shiftId ? Number(shiftId) : undefined,
        requestedCheckinTime:  checkinTime  ? new Date(checkinTime).toISOString()  : undefined,
        requestedCheckoutTime: checkoutTime ? new Date(checkoutTime).toISOString() : undefined,
        requestedShiftId: isShift && shiftId ? Number(shiftId) : undefined,
        reason: reason.trim(),
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
      onClose={onClose}
      size="sm"
      title="Yêu cầu điều chỉnh — Chưa có bản ghi"
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>Huỷ</Button>
          <Button className="flex-1" loading={loading} onClick={handleSubmit as any}>Gửi yêu cầu</Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Date info */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 mb-0.5">Ngày chưa có bản ghi</p>
          <p className="text-sm font-bold text-amber-900">{date}</p>
          <p className="text-xs text-amber-600 mt-1">
            Hệ thống sẽ tạo bản ghi chấm công mới dựa trên thông tin bạn cung cấp.
          </p>
        </div>

        {/* Shift selector — SHIFT employees only */}
        {isShift && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Ca làm việc <span className="text-red-500">*</span>
            </label>
            {shiftsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Spinner className="h-4 w-4" /> Đang tải danh sách ca...
              </div>
            ) : (
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Chọn ca làm việc —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime} — {s.endTime})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Requested check-in */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Giờ vào <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={checkinTime}
            onChange={(e) => setCheckinTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Requested check-out */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Giờ ra</label>
          <input
            type="datetime-local"
            value={checkoutTime}
            onChange={(e) => setCheckoutTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Reason */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Lý do <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Mô tả lý do cần điều chỉnh chấm công..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {error && <Alert variant="error" message={error} />}
      </form>
    </Modal>
  );
}

// Helper: next calendar day
function nextDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
