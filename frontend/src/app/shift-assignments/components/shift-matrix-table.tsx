'use client';

import { useState, useCallback } from 'react';
import type { ShiftAssignmentRow, ShiftSummary } from '@/types';
import { shiftAssignmentService } from '@/services/shift-assignment.service';

interface Props {
  rows: ShiftAssignmentRow[];
  shifts: ShiftSummary[];
  year: number;
  month: number;
  onEdit: (row: ShiftAssignmentRow) => void;
  onRowsChange: (rows: ShiftAssignmentRow[]) => void;
}

export function ShiftMatrixTable({ rows, shifts, year, month, onEdit, onRowsChange }: Props) {
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  const showError = (msg: string) => {
    setToastError(msg);
    setTimeout(() => setToastError(null), 4000);
  };

  const handleToggle = useCallback(async (
    row: ShiftAssignmentRow,
    shift: ShiftSummary,
    isChecked: boolean,
  ) => {
    const cellKey = `${row.employee.id}-${shift.id}`;
    if (pendingCell === cellKey) return;
    setPendingCell(cellKey);

    // Optimistic update
    const prevRows = rows;
    if (isChecked) {
      // Optimistic: remove
      const next = rows.map((r) =>
        r.employee.id !== row.employee.id
          ? r
          : { ...r, assignments: r.assignments.filter((a) => a.shiftId !== shift.id) },
      );
      onRowsChange(next);
      const asgn = row.assignments.find((a) => a.shiftId === shift.id);
      if (!asgn) { setPendingCell(null); return; }
      try {
        await shiftAssignmentService.unassign(asgn.assignmentId);
      } catch (e: unknown) {
        onRowsChange(prevRows);
        const msg = e instanceof Error ? e.message : 'Không thể bỏ ca';
        showError(msg);
      }
    } else {
      // Optimistic: add placeholder
      const placeholder = {
        assignmentId: -Date.now(),
        shiftId: shift.id,
        shiftName: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isDefault: shift.id === row.employee.defaultShiftId,
      };
      const next = rows.map((r) =>
        r.employee.id !== row.employee.id
          ? r
          : { ...r, assignments: [...r.assignments, placeholder] },
      );
      onRowsChange(next);
      try {
        const created = await shiftAssignmentService.assign({
          employeeId: row.employee.id,
          shiftId: shift.id,
          year,
          month,
        });
        // Replace placeholder with real id
        const withReal = next.map((r) =>
          r.employee.id !== row.employee.id
            ? r
            : {
                ...r,
                assignments: r.assignments.map((a) =>
                  a.assignmentId === placeholder.assignmentId
                    ? { ...a, assignmentId: created.id }
                    : a,
                ),
              },
        );
        onRowsChange(withReal);
      } catch (e: unknown) {
        onRowsChange(prevRows);
        const msg = e instanceof Error ? e.message : 'Không thể thêm ca';
        showError(msg);
      }
    }
    setPendingCell(null);
  }, [rows, year, month, onRowsChange, pendingCell]);

  const totalEmployees = rows.length;
  const totalShifts = shifts.length;

  return (
    <div className="relative">
      {/* Toast */}
      {toastError && (
        <div className="absolute top-0 right-0 z-20 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 shadow">
          {toastError}
        </div>
      )}

      <div className="mb-3 text-sm text-gray-500">
        {totalEmployees} nhân viên &bull; {totalShifts} ca &bull;{' '}
        <span className="text-gray-400 text-xs">* = ca mặc định</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                Nhân viên
              </th>
              {shifts.map((s) => (
                <th
                  key={s.id}
                  className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap min-w-[100px]"
                >
                  <div className="flex items-center justify-center gap-1">
                    {s.name}
                    {s.isDefault && (
                      <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-600 leading-none">
                        mặc định
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-normal text-gray-400">
                    {s.startTime}–{s.endTime}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-center font-medium text-gray-600">Sửa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.employee.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap">
                  <div className="font-medium text-gray-800">{row.employee.fullName}</div>
                  <div className="text-xs text-gray-400">{row.employee.code}</div>
                </td>
                {shifts.map((shift) => {
                  const asgn = row.assignments.find((a) => a.shiftId === shift.id);
                  const isChecked = !!asgn;
                  const cellKey = `${row.employee.id}-${shift.id}`;
                  const isPending = pendingCell === cellKey;
                  const mode = row.employee.workingMode;

                  // FIXED: only the default shift is allowed (others locked)
                  // SHIFT: default shift is locked (shift workers skip fixed schedule)
                  const isLocked =
                    (mode === 'FIXED' && !shift.isDefault) ||
                    (mode === 'SHIFT' && !!shift.isDefault);

                  return (
                    <td key={shift.id} className={`px-3 py-2 text-center ${isLocked ? 'bg-gray-50' : ''}`}>
                      <label className={`inline-flex items-center justify-center gap-1 ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isPending || isLocked}
                          onChange={() => !isLocked && handleToggle(row, shift, isChecked)}
                          title={isLocked
                            ? mode === 'FIXED'
                              ? 'Nhân viên hành chính chỉ được dùng ca mặc định'
                              : 'Nhân viên làm ca không dùng ca mặc định'
                            : undefined}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600
                                     focus:ring-indigo-500 cursor-pointer
                                     disabled:cursor-not-allowed disabled:opacity-40"
                        />
                        {asgn?.isDefault && (
                          <span className="text-xs text-gray-400 leading-none">*</span>
                        )}
                      </label>
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => onEdit(row)}
                    className="rounded px-2 py-1 text-xs font-medium text-indigo-600
                               hover:bg-indigo-50 transition-colors"
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
