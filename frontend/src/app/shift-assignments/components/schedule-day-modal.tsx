'use client';

import { useState } from 'react';
import type { EmployeeShiftSchedule, ShiftSummary } from '@/types';
import { shiftScheduleService } from '@/services/shift-schedule.service';

interface Props {
  dateStr: string;          // YYYY-MM-DD
  employeeId: number;
  employeeName: string;
  rows: EmployeeShiftSchedule[];
  availableShifts: ShiftSummary[];
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduleDayModal({
  dateStr, employeeId, employeeName, rows, availableShifts, onClose, onSaved,
}: Props) {
  const [selectedShiftId, setSelectedShiftId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignedShiftIds = new Set(rows.map((r) => r.shiftId));
  const unassigned = availableShifts.filter((s) => !assignedShiftIds.has(s.id));

  const handleAdd = async () => {
    if (!selectedShiftId) return;
    setSaving(true); setError(null);
    try {
      await shiftScheduleService.assignDay({ employeeId, shiftId: Number(selectedShiftId), date: dateStr });
      setSelectedShiftId('');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: number) => {
    setRemovingId(id); setError(null);
    try {
      await shiftScheduleService.removeOne(id);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">{employeeName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Assigned shifts */}
        <div className="px-5 py-3 space-y-2 max-h-48 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Chưa có ca nào trong ngày này</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-indigo-800">{r.shift.name}</p>
                  <p className="text-xs text-indigo-400">{r.shift.startTime} – {r.shift.endTime}</p>
                </div>
                <button
                  onClick={() => handleRemove(r.id)}
                  disabled={removingId === r.id}
                  className="ml-2 rounded p-1 text-red-400 hover:bg-red-50 disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add shift */}
        {unassigned.length > 0 && (
          <div className="flex gap-2 px-5 pb-3">
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value ? Number(e.target.value) : '')}
              className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Chọn ca...</option>
              {unassigned.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!selectedShiftId || saving}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? '...' : 'Thêm'}
            </button>
          </div>
        )}

        {error && <p className="px-5 pb-2 text-xs text-red-600">{error}</p>}

        <div className="border-t border-gray-100 px-5 py-3 text-right">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
