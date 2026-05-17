'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EmployeeShiftSchedule, ShiftAssignmentRow, ShiftSummary } from '@/types';
import { shiftScheduleService } from '@/services/shift-schedule.service';
import { ScheduleCalendarGrid } from './schedule-calendar-grid';
import { ScheduleDayModal } from './schedule-day-modal';
import { ScheduleBulkRangeModal } from './schedule-bulk-range-modal';

interface Props {
  year: number;
  month: number;
  rows: ShiftAssignmentRow[];     // employee list from monthly matrix
  shifts: ShiftSummary[];         // available shifts
  isManager: boolean;
  onNavigate: (delta: number) => void;
}

export function ScheduleCalendarTab({ year, month, rows, shifts, isManager, onNavigate }: Props) {
  const [schedules, setSchedules] = useState<EmployeeShiftSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected employee for single-employee calendar view
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>(rows[0]?.employee.id ?? '');

  // Modal state
  const [dayModal, setDayModal] = useState<{ dateStr: string; rows: EmployeeShiftSchedule[] } | null>(null);
  const [showBulk, setShowBulk] = useState(false);

  const selectedEmp = rows.find((r) => r.employee.id === Number(selectedEmpId));

  const load = useCallback(async () => {
    if (!selectedEmpId) return;
    setLoading(true); setError(null);
    try {
      const data = await shiftScheduleService.list({ year, month, employeeId: Number(selectedEmpId) });
      setSchedules(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không thể tải lịch ca');
    } finally {
      setLoading(false);
    }
  }, [year, month, selectedEmpId]);

  useEffect(() => { load(); }, [load]);

  // Reset employee selection when rows change (e.g., month change)
  useEffect(() => {
    if (rows.length > 0 && !rows.find((r) => r.employee.id === Number(selectedEmpId))) {
      setSelectedEmpId(rows[0].employee.id);
    }
  }, [rows, selectedEmpId]);

  // Build Map<dateStr, EmployeeShiftSchedule[]> for calendar grid
  const cellsByDate = new Map<string, EmployeeShiftSchedule[]>();
  for (const s of schedules) {
    const dateStr = s.date.slice(0, 10); // normalize to YYYY-MM-DD
    if (!cellsByDate.has(dateStr)) cellsByDate.set(dateStr, []);
    cellsByDate.get(dateStr)!.push(s);
  }

  const handleCellClick = (dateStr: string) => {
    setDayModal({ dateStr, rows: cellsByDate.get(dateStr) ?? [] });
  };

  const handleSaved = () => {
    load();
    // Refresh day modal rows after mutation
    setDayModal((prev) =>
      prev ? { ...prev, rows: cellsByDate.get(prev.dateStr) ?? [] } : null,
    );
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Month navigator */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1">
          <button onClick={() => onNavigate(-1)} className="rounded p-1 hover:bg-gray-100 text-gray-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="px-2 text-sm font-medium text-gray-700 min-w-[90px] text-center">
            Tháng {month}/{year}
          </span>
          <button onClick={() => onNavigate(1)} className="rounded p-1 hover:bg-gray-100 text-gray-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Employee picker */}
        <select
          value={selectedEmpId}
          onChange={(e) => setSelectedEmpId(e.target.value ? Number(e.target.value) : '')}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[200px]"
        >
          <option value="">Chọn nhân viên...</option>
          {rows.map((r) => (
            <option key={r.employee.id} value={r.employee.id}>
              {r.employee.fullName} ({r.employee.code})
            </option>
          ))}
        </select>

        {!isManager && (
          <button
            onClick={() => setShowBulk(true)}
            className="ml-auto rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Phân lịch theo khoảng ngày
          </button>
        )}
      </div>

      {/* Calendar body */}
      {loading && (
        <div className="flex justify-center py-16 text-sm text-gray-400">Đang tải...</div>
      )}
      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {!loading && !error && !selectedEmpId && (
        <p className="py-12 text-center text-sm text-gray-400">Chọn nhân viên để xem lịch ca theo ngày</p>
      )}
      {!loading && !error && selectedEmpId && (
        <ScheduleCalendarGrid
          year={year}
          month={month}
          cellsByDate={cellsByDate}
          onCellClick={handleCellClick}
        />
      )}

      {/* Day modal */}
      {dayModal && selectedEmp && (
        <ScheduleDayModal
          dateStr={dayModal.dateStr}
          employeeId={selectedEmp.employee.id}
          employeeName={selectedEmp.employee.fullName ?? ''}
          rows={dayModal.rows}
          availableShifts={shifts}
          onClose={() => { setDayModal(null); load(); }}
          onSaved={() => load()}
        />
      )}

      {/* Bulk range modal */}
      {showBulk && (
        <ScheduleBulkRangeModal
          rows={rows}
          allShifts={shifts}
          onClose={() => setShowBulk(false)}
          onAssigned={() => { setShowBulk(false); load(); }}
        />
      )}
    </div>
  );
}
