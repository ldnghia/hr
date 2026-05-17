'use client';

import { useState } from 'react';
import type { ShiftAssignmentRow, ShiftSummary } from '@/types';
import { shiftScheduleService } from '@/services/shift-schedule.service';

interface Props {
  rows: ShiftAssignmentRow[];
  allShifts: ShiftSummary[];
  onClose: () => void;
  onAssigned: () => void;
}

export function ScheduleBulkRangeModal({ rows, allShifts, onClose, onAssigned }: Props) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [shiftId, setShiftId] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEmp = (id: number) =>
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedEmployeeIds(
      selectedEmployeeIds.size === rows.length
        ? new Set()
        : new Set(rows.map((r) => r.employee.id)),
    );

  const handleSubmit = async () => {
    if (!shiftId || !dateFrom || !dateTo || selectedEmployeeIds.size === 0) {
      setError('Vui lòng chọn đầy đủ nhân viên, ca và khoảng ngày');
      return;
    }
    setSaving(true); setError(null);
    try {
      const result = await shiftScheduleService.bulkRange({
        employeeIds: [...selectedEmployeeIds],
        shiftId: Number(shiftId),
        dateFrom,
        dateTo,
        note: note.trim() || undefined,
      });
      alert(`Đã tạo ${result.created} / ${result.requested} lịch ca`);
      onAssigned();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-800">Phân lịch ca theo ngày</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Shift + date range */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Ca làm việc</label>
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">Chọn ca...</option>
                {allShifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Từ ngày</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Đến ngày</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Ghi chú (tuỳ chọn)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Tăng ca tháng 5"
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>

          {/* Employee list */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Nhân viên ({selectedEmployeeIds.size}/{rows.length})</label>
              <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline">
                {selectedEmployeeIds.size === rows.length ? 'Bỏ tất cả' : 'Chọn tất cả'}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {rows.map((r) => (
                <label key={r.employee.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedEmployeeIds.has(r.employee.id)}
                    onChange={() => toggleEmp(r.employee.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{r.employee.fullName}</span>
                  <span className="text-xs text-gray-400">{r.employee.code}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Hủy
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Phân ca'}
          </button>
        </div>
      </div>
    </div>
  );
}
