import api from '@/lib/axios';
import type {
  AttendanceRecord,
  TodayStatus,
  Shift,
  WorkLocation,
  PaginatedResponse,
} from '@/types';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface ImportPayload {
  records: { employeeCode: string; timestamp: string }[];
}

export interface ReportParams {
  page?: number;
  limit?: number;
  employeeId?: number;
  departmentId?: number;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  employeeName?: string;
  employeeCode?: string;
  isLate?: boolean;
  isEarlyOut?: boolean;
  isOvertime?: boolean;
}

export interface CheckInPayload {
  lat?: number;
  lng?: number;
  deviceId?: string;
  timestamp?: string;
  locationNote?: string;
}

export interface CheckOutPayload {
  lat?: number;
  lng?: number;
  deviceId?: string;
  timestamp?: string;
  locationNote?: string;
}

export interface MyRecordsParams {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface NearestBranch {
  id: number;
  name: string;
  distanceM: number;
  isInOffice: boolean;
}

export interface CheckInResponse {
  attendance: AttendanceRecord;
  isLate: boolean;
  shift: { name: string; startTime: string; endTime: string } | null;
  location: { id: number; distanceM: number } | null;
  office: { status: 'IN_OFFICE' | 'OUTSIDE'; distanceM: number } | null;
  locationSource: 'GPS' | 'NO_LOCATION';
  nearestBranch: NearestBranch | null;
}

export interface CheckOutResponse {
  attendance: AttendanceRecord;
  workingHours: number | string;  // Prisma Decimal serializes as string in JSON
  isEarlyOut: boolean;
  isOvertime: boolean;
  overtimeHours: number | string;  // Prisma Decimal serializes as string in JSON
}

export interface CreateShiftPayload {
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  graceLateMinutes?: number;
  graceEarlyMinutes?: number;
  isDefault?: boolean;
}

export interface CreateLocationPayload {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  address?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const attendanceService = {
  // ── Legacy / admin ──────────────────────────────────────────────────────────

  import: (payload: ImportPayload) =>
    api.post('/attendance/import', payload).then((r) => r.data),

  report: (params?: ReportParams) =>
    api
      .get<PaginatedResponse<AttendanceRecord> & { summary: { totalRecords: number; totalWorkingHours: number } }>(
        '/attendance/report',
        { params },
      )
      .then((r) => r.data),

  export: (params?: ReportParams) =>
    api.get('/attendance/report/export', { params, responseType: 'blob' }),

  exportGrid: (params?: ReportParams) =>
    api.get('/attendance/report/export-grid', { params, responseType: 'blob' }),

  exportSummary: (params?: ReportParams) =>
    api.get('/attendance/report/export-summary', { params, responseType: 'blob' }),

  list: (params?: { page?: number; limit?: number; employeeId?: number; date?: string }) =>
    api.get<PaginatedResponse<AttendanceRecord>>('/attendance', { params }).then((r) => r.data),

  summary: (month?: number, year?: number) =>
    api.get('/attendance/summary', { params: { month, year } }).then((r) => r.data),

  // ── WFM: self-service ────────────────────────────────────────────────────────

  /** POST /attendance/check-in — with optional GPS */
  checkIn: (payload: CheckInPayload = {}) =>
    api.post<CheckInResponse>('/attendance/check-in', payload).then((r) => r.data),

  /** POST /attendance/check-out — with optional GPS */
  checkOut: (payload: CheckOutPayload = {}) =>
    api.post<CheckOutResponse>('/attendance/check-out', payload).then((r) => r.data),

  /** GET /attendance/today — today's check-in/out status */
  today: () =>
    api.get<TodayStatus>('/attendance/today').then((r) => r.data),

  /** GET /attendance/me — my attendance history (paginated) */
  me: (params?: MyRecordsParams) =>
    api.get<PaginatedResponse<AttendanceRecord>>('/attendance/me', { params }).then((r) => r.data),

  // ── Shifts ───────────────────────────────────────────────────────────────────

  shifts: () =>
    api.get<Shift[]>('/attendance/shifts').then((r) => r.data),

  createShift: (payload: CreateShiftPayload) =>
    api.post<Shift>('/attendance/shifts', payload).then((r) => r.data),

  updateShift: (id: number, payload: Partial<CreateShiftPayload>) =>
    api.patch<Shift>(`/attendance/shifts/${id}`, payload).then((r) => r.data),

  // ── Locations ────────────────────────────────────────────────────────────────

  locations: () =>
    api.get<WorkLocation[]>('/attendance/locations').then((r) => r.data),

  createLocation: (payload: CreateLocationPayload) =>
    api.post<WorkLocation>('/attendance/locations', payload).then((r) => r.data),

  updateLocation: (id: number, payload: Partial<CreateLocationPayload>) =>
    api.patch<WorkLocation>(`/attendance/locations/${id}`, payload).then((r) => r.data),
};
