'use client';

import { useState } from 'react';
import type { ShiftAssignmentRow, ShiftSummary } from '@/types';
import { shiftAssignmentService } from '@/services/shift-assignment.service';

interface Props {
  rows: ShiftAssignmentRow[];
  allShifts: ShiftSummary[];
  year: number;
  month: number;
  defaultDeptFilter?: number;
  onClose: () => void;
  onAssigned: () => void;
}

type Step = 1 | 2 | 3;

export function BulkAssignModal({ rows, allShifts, year, month, defaultDeptFilter, onClose, onAssigned }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState(defaultDeptFilter ? String(defaultDeptFilter) : '');

  const depts = Array.from(
    new Map(
      rows
        .filter((r) => r.employee.department)
        .map((r) => [r.employee.department!.id, r.employee.department!.name]),
    ).entries(),
  );

  const filteredRows = deptFilter
    ? rows.filter((r) => r.employee.department?.id === Number(deptFilter))
    : rows;

  const toggleEmployee = (id: number) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedEmployeeIds.size === filteredRows.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(filteredRows.map((r) => r.employee.id)));
    }
  };

  const selectedShift = allShifts.find((s) => s.id === selectedShiftId);

  // Filter shifts to those linked to the selected department (or global shifts)
  const visibleShifts = deptFilter
    ? allShifts.filter((s) => !s.departmentId || s.departmentId === Number(deptFilter))
    : allShifts;

  const handleConfirm = async () => {
    if (!selectedShiftId || selectedEmployeeIds.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await shiftAssignmentService.bulkAssign({
        employeeIds: [...selectedEmployeeIds],
        shiftId: selectedShiftId,
        year,
        month,
      });
      onAssigned();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi khi phân ca hàng loạt';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Phân ca hàng loạt</h2>
            <div className="flex gap-2 mt-1">
              {([1, 2, 3] as Step[]).map((s) => (
                <span
                  key={s}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    step === s
                      ? 'bg-indigo-100 text-indigo-700'
                      : step > s
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {s === 1 ? 'Chọn NV' : s === 2 ? 'Chọn ca' : 'Xác nhận'}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1: Select employees */}
        {step === 1 && (
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              {depts.length > 0 && (
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">Tất cả phòng ban</option>
                  {depts.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              )}
              <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline ml-auto">
                {selectedEmployeeIds.size === filteredRows.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredRows.map((r) => (
                <label key={r.employee.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEmployeeIds.has(r.employee.id)}
                    onChange={() => toggleEmployee(r.employee.id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  <span className="text-sm text-gray-800">{r.employee.fullName}</span>
                  <span className="text-xs text-gray-400 ml-auto">{r.employee.code}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">Đã chọn {selectedEmployeeIds.size} nhân viên</p>
          </div>
        )}

        {/* Step 2: Select shift */}
        {step === 2 && (
          <div className="px-6 py-4 space-y-2 max-h-72 overflow-y-auto">
            {visibleShifts.map((shift) => (
              <label
                key={shift.id}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedShiftId === shift.id
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="shift"
                  value={shift.id}
                  checked={selectedShiftId === shift.id}
                  onChange={() => setSelectedShiftId(shift.id)}
                  className="h-4 w-4 border-gray-300 text-indigo-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800">{shift.name}</div>
                  <div className="text-xs text-gray-400">{shift.startTime} – {shift.endTime}</div>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="px-6 py-4">
            <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
              <p><span className="font-medium">Ca:</span> {selectedShift?.name} ({selectedShift?.startTime}–{selectedShift?.endTime})</p>
              <p><span className="font-medium">Tháng:</span> {month}/{year}</p>
              <p><span className="font-medium">Số nhân viên:</span> {selectedEmployeeIds.size}</p>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between border-t border-gray-100 px-6 py-4">
          <button
            onClick={() => step > 1 ? setStep((step - 1) as Step) : onClose()}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {step === 1 ? 'Hủy' : 'Quay lại'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              disabled={(step === 1 && selectedEmployeeIds.size === 0) || (step === 2 && !selectedShiftId)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Tiếp theo
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Xác nhận phân ca'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
