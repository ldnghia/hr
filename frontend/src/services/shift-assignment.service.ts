import api from '@/lib/axios';
import type { ShiftAssignment, ShiftAssignmentMatrixResponse } from '@/types';

export interface AssignShiftPayload {
  employeeId: number;
  shiftId: number;
  year: number;
  month: number;
}

export interface BulkAssignPayload {
  employeeIds: number[];
  shiftId: number;
  year: number;
  month: number;
}

export interface InitializeMonthPayload {
  year: number;
  month: number;
  departmentId?: number;
}

export interface ResetToDefaultPayload {
  year: number;
  month: number;
  employeeId?: number;
}

export const shiftAssignmentService = {
  /** GET /shift-assignments?year=&month=&departmentId=&branchId= */
  getMonthMatrix: (params: {
    year: number;
    month: number;
    departmentId?: number;
    branchId?: number;
  }) =>
    api
      .get<ShiftAssignmentMatrixResponse>('/shift-assignments', { params })
      .then((r) => r.data),

  /** GET /shift-assignments/me?year=&month= */
  getMyAssignments: (year: number, month: number) =>
    api
      .get<ShiftAssignment[]>('/shift-assignments/me', { params: { year, month } })
      .then((r) => r.data),

  /** POST /shift-assignments/initialize-month */
  initializeMonth: (payload: InitializeMonthPayload) =>
    api
      .post<{ created: number; skipped: number }>('/shift-assignments/initialize-month', payload)
      .then((r) => r.data),

  /** POST /shift-assignments/copy-from-previous */
  copyFromPrevious: (payload: InitializeMonthPayload) =>
    api
      .post<{ copied: number }>('/shift-assignments/copy-from-previous', payload)
      .then((r) => r.data),

  /** POST /shift-assignments */
  assign: (payload: AssignShiftPayload) =>
    api
      .post<ShiftAssignment>('/shift-assignments', payload)
      .then((r) => r.data),

  /** DELETE /shift-assignments/:id */
  unassign: (id: number) =>
    api.delete(`/shift-assignments/${id}`),

  /** POST /shift-assignments/bulk */
  bulkAssign: (payload: BulkAssignPayload) =>
    api
      .post<{ assigned: number; skipped: number }>('/shift-assignments/bulk', payload)
      .then((r) => r.data),

  /** POST /shift-assignments/reset-to-default */
  resetToDefault: (payload: ResetToDefaultPayload) =>
    api
      .post<{ deleted: number; created: number }>('/shift-assignments/reset-to-default', payload)
      .then((r) => r.data),

  /** POST /shift-assignments/apply-department-shifts */
  applyDepartmentShifts: (payload: InitializeMonthPayload) =>
    api
      .post<{ updated: number }>('/shift-assignments/apply-department-shifts', payload)
      .then((r) => r.data),
};
