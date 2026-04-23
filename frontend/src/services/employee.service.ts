import api from '@/lib/axios';
import type { Employee, PaginatedResponse } from '@/types';

export interface ListEmployeeParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  role?: string;
  departmentId?: number;
  managerId?: number;
}

export interface CreateEmployeePayload {
  code: string;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  branchId: number;
  departmentId: number;
  positionId: number;
  managerId?: number;
  status?: string;
  role?: string;
  telegramId?: string;
  initialLeaveBalance?: number;
}

export interface UpdateEmployeePayload {
  code?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  status?: string;
  role?: string;
  branchId?: number;
  departmentId?: number;
  positionId?: number;
  managerId?: number;
  telegramId?: string;
}

export interface AdminUpdateProfilePayload {
  fullName?: string;
  email?: string;
  phone?: string;
  status?: string;
}

export interface UpdateMePayload {
  fullName?: string;
  email?: string;
  phone?: string;
}

export const employeeService = {
  list: (params?: ListEmployeeParams) =>
    api.get<PaginatedResponse<Employee>>('/employees', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<Employee>(`/employees/${id}`).then((r) => r.data),

  create: (payload: CreateEmployeePayload) =>
    api.post<Employee>('/employees', payload).then((r) => r.data),

  update: (id: number, payload: UpdateEmployeePayload) =>
    api.patch<Employee>(`/employees/${id}`, payload).then((r) => r.data),

  /** Admin: update basic profile fields (name/email/phone/status) */
  updateProfile: (id: number, payload: AdminUpdateProfilePayload) =>
    api.patch<Employee>(`/employees/${id}/profile`, payload).then((r) => r.data),

  /** Admin: reset an employee's password */
  updatePassword: (id: number, newPassword: string) =>
    api.patch<{ success: boolean }>(`/employees/${id}/password`, { newPassword }).then((r) => r.data),

  deactivate: (id: number) =>
    api.delete<Employee>(`/employees/${id}`).then((r) => r.data),

  history: (id: number) =>
    api.get(`/employees/${id}/history`).then((r) => r.data),

  // ─── Self-profile ──────────────────────────────────────────────────────────

  getMe: () =>
    api.get<Employee>('/me').then((r) => r.data),

  updateMe: (payload: UpdateMePayload) =>
    api.patch<Employee>('/me', payload).then((r) => r.data),

  /** Self: change own password (requires current password verification) */
  updateMyPassword: (currentPassword: string, newPassword: string) =>
    api.patch<{ success: boolean }>('/me/password', { currentPassword, newPassword }).then((r) => r.data),
};
