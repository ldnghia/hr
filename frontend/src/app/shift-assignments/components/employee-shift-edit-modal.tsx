'use client';

import { useState } from 'react';
import type { ShiftAssignmentRow, ShiftSummary } from '@/types';
import { shiftAssignmentService } from '@/services/shift-assignment.service';

interface Props {
  row: ShiftAssignmentRow;
  allShifts: ShiftSummary[];
  year: number;
  month: number;
  onClose: () => void;
  onSaved: (updated: ShiftAssignmentRow) => void;
}

export function EmployeeShiftEditModal({ row, allShifts, year, month, onClose, onSaved }: Props) {
  const assignedShiftIds = new Set(row.assignments.map((a) => a.shiftId));
  const [selected, setSelected] = useState<Set<number>>(new Set(assignedShiftIds));

  // Only show shifts for this employee's department (or global shifts with no dept link)
  const empDeptId = row.employee.department?.id;
  const mode = row.employee.workingMode;

  // Apply workingMode filter:
  //  FIXED → only default shift selectable
  //  SHIFT → default shift excluded
  const visibleShifts = allShifts
    .filter((s) => !empDeptId || !s.departmentId || s.departmentId === empDeptId)
    .filter((s) => {
      if (mode === 'FIXED') return !!s.isDefault;
      if (mode === 'SHIFT') return !s.isDefault;
      return true;
    });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (shiftId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const toAdd = [...selected].filter((id) => !assignedShiftIds.has(id));
    const toRemove = [...assignedShiftIds].filter((id) => !selected.has(id));

    try {
      // Add new assignments
      const addedAssignments = await Promise.all(
        toAdd.map((shiftId) =>
          shiftAssignmentService.assign({
            employeeId: row.employee.id,
            shiftId,
            year,
            month,
          }),
        ),
      );

      // Remove unselected assignments
      await Promise.all(
        toRemove.map((shiftId) => {
          const asgn = row.assignments.find((a) => a.shiftId === shiftId);
          return asgn ? shiftAssignmentService.unassign(asgn.assignmentId) : Promise.resolve();
        }),
      );

      // Build updated row
      const remaining = row.assignments.filter((a) => !toRemove.includes(a.shiftId));
      const newEntries = addedAssignments.map((a) => {
        const shift = allShifts.find((s) => s.id === a.shiftId)!;
        return {
          assignmentId: a.id,
          shiftId: a.shiftId,
          shiftName: shift?.name ?? '',
          startTime: shift?.startTime ?? '',
          endTime: shift?.endTime ?? '',
          isDefault: a.shiftId === row.employee.defaultShiftId,
        };
      });

      onSaved({ ...row, assignments: [...remaining, ...newEntries] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi khi lưu phân ca';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Sửa ca làm việc</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {row.employee.fullName} ({row.employee.code}) — Tháng {month}/{year}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3 max-h-72 overflow-y-auto">
          {visibleShifts.map((shift) => {
            const isDefault = shift.id === row.employee.defaultShiftId;
            return (
              <label
                key={shift.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(shift.id)}
                  onChange={() => toggle(shift.id)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm text-gray-800">{shift.name}</span>
                    {isDefault && (
                      <span className="text-xs text-gray-400 bg-gray-100 rounded px-1">mặc định</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{shift.startTime} – {shift.endTime}</div>
                </div>
              </label>
            );
          })}
        </div>

        {error && (
          <p className="px-6 pb-2 text-sm text-red-600">{error}</p>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
}
