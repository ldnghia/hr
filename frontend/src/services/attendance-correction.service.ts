import api from '@/lib/axios';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorrectionRequest {
  id: number;
  employeeId: number;
  attendanceId: number;
  requestedCheckinTime?: string | null;
  requestedCheckoutTime?: string | null;
  requestedCheckinNote?: string | null;
  requestedCheckoutNote?: string | null;
  requestedShiftId?: number | null;
  originalCheckinTime?: string | null;
  originalCheckoutTime?: string | null;
  originalCheckinNote?: string | null;
  originalCheckoutNote?: string | null;
  originalShiftId?: number | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  employee?: { id: number; fullName?: string; code?: string };
  reviewer?: { id: number; fullName?: string } | null;
  attendance?: { id: number; date: string } | null;
  requestedShift?: { id: number; name: string } | null;
}

export interface CreateCorrectionPayload {
  attendanceId: number;
  requestedCheckinTime?: string;
  requestedCheckoutTime?: string;
  requestedCheckinNote?: string;
  requestedCheckoutNote?: string;
  requestedShiftId?: number;
  reason: string;
}

export interface ListCorrectionParams {
  status?: string;
  employeeId?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AdminEditPayload {
  checkinTime?: string;
  checkoutTime?: string;
  checkinNote?: string;
  checkoutNote?: string;
  shiftId?: number;
  reason: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const correctionService = {
  list: (params?: ListCorrectionParams) =>
    api.get('/attendance-correction', { params }).then((r) => r.data),

  getById: (id: number) =>
    api.get(`/attendance-correction/${id}`).then((r) => r.data),

  create: (payload: CreateCorrectionPayload) =>
    api.post('/attendance-correction', payload).then((r) => r.data),

  cancel: (id: number) =>
    api.post(`/attendance-correction/${id}/cancel`).then((r) => r.data),

  approve: (id: number, reviewNote?: string) =>
    api.post(`/attendance-correction/${id}/approve`, { reviewNote }).then((r) => r.data),

  reject: (id: number, reviewNote: string) =>
    api.post(`/attendance-correction/${id}/reject`, { reviewNote }).then((r) => r.data),

  adminEdit: (attendanceId: number, payload: AdminEditPayload) =>
    api.patch(`/attendance/${attendanceId}/admin-edit`, payload).then((r) => r.data),
};
