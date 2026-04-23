import api from '@/lib/axios';
import type {
  LeaveRequest,
  LeaveBalanceWithLog,
  LeaveBalance,
  PaginatedResponse,
} from '@/types';

export interface CreateLeavePayload {
  leaveType: 'annual' | 'sick' | 'unpaid' | 'compensatory';
  fromDate: string;
  toDate: string;
  isHalfDay?: boolean;
  reason: string;
}

export interface ListLeaveParams {
  page?: number;
  limit?: number;
  status?: string;
  leaveType?: string;
  employeeId?: number;
}

export interface SetBalancePayload {
  total: number;
  reason?: string;
}

export interface AccruePayload {
  daysPerEmployee?: number;
  employeeId?: number;
  note?: string;
}

export const leaveService = {
  create: (payload: CreateLeavePayload) =>
    api.post<LeaveRequest>('/leave-request', payload).then((r) => r.data),

  listAll: (params?: ListLeaveParams) =>
    api.get<PaginatedResponse<LeaveRequest>>('/leave-request', { params }).then((r) => r.data),

  listMy: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<PaginatedResponse<LeaveRequest>>('/leave-request/my', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<LeaveRequest>(`/leave-request/${id}`).then((r) => r.data),

  approve: (id: number, comments?: string) =>
    api.post(`/leave-request/${id}/approve`, { comments }).then((r) => r.data),

  reject: (id: number, comments?: string) =>
    api.post(`/leave-request/${id}/reject`, { comments }).then((r) => r.data),

  cancel: (id: number) =>
    api.post(`/leave-request/${id}/cancel`).then((r) => r.data),

  /** Returns { balance, accrualLog } */
  balance: () =>
    api.get<LeaveBalanceWithLog>('/leave-request/balance').then((r) => r.data),

  /** Admin/HR: all employee balances */
  allBalances: () =>
    api.get<LeaveBalance[]>('/leave-request/balance/all').then((r) => r.data),

  /** Admin/HR/Manager: get a specific employee's balance */
  getEmployeeBalance: (employeeId: number) =>
    api.get<LeaveBalance | null>(`/leave-request/balance/${employeeId}`).then((r) => r.data),

  /** Admin/HR: set employee balance total */
  setBalance: (employeeId: number, payload: SetBalancePayload) =>
    api.post<LeaveBalance>(`/leave-request/balance/${employeeId}`, payload).then((r) => r.data),

  /** Admin/HR: trigger manual accrual */
  accrue: (payload?: AccruePayload) =>
    api.post<{ processed: number }>('/leave-request/balance/accrue', payload ?? {}).then((r) => r.data),

  pendingForManager: () =>
    api.get<LeaveRequest[]>('/leave-request/pending/manager').then((r) => r.data),

  pendingForHR: () =>
    api.get<LeaveRequest[]>('/leave-request/pending/hr').then((r) => r.data),
};
