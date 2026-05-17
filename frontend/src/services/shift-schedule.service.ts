import axiosInstance from '@/lib/axios';
import type { EmployeeShiftSchedule, DayOff } from '@/types';

export interface AssignDayPayload {
  employeeId: number;
  shiftId: number;
  /** YYYY-MM-DD */
  date: string;
  note?: string;
}

export interface BulkRangePayload {
  employeeIds: number[];
  shiftId: number;
  dateFrom: string;
  dateTo: string;
  note?: string;
}

const BASE = '/shift-schedules';

export const shiftScheduleService = {
  /** List per-day schedules for a month (admin/hr/manager) */
  async list(params: { year: number; month: number; employeeId?: number; departmentId?: number }): Promise<EmployeeShiftSchedule[]> {
    const r = await axiosInstance.get<EmployeeShiftSchedule[]>(BASE, { params });
    return r.data;
  },

  /** List per-day schedules for a date range (weekly view) */
  async listRange(params: { dateFrom: string; dateTo: string; departmentId?: number; branchId?: number }): Promise<EmployeeShiftSchedule[]> {
    const r = await axiosInstance.get<EmployeeShiftSchedule[]>(BASE, { params });
    return r.data;
  },

  /** List my own schedules for a month */
  async listMine(year: number, month: number): Promise<EmployeeShiftSchedule[]> {
    const r = await axiosInstance.get<EmployeeShiftSchedule[]>(`${BASE}/me`, { params: { year, month } });
    return r.data;
  },

  /** Assign a shift to an employee on a specific date */
  async assignDay(payload: AssignDayPayload): Promise<EmployeeShiftSchedule> {
    const r = await axiosInstance.post<EmployeeShiftSchedule>(BASE, payload);
    return r.data;
  },

  /** Bulk assign a shift over a date range */
  async bulkRange(payload: BulkRangePayload): Promise<{ created: number; requested: number }> {
    const r = await axiosInstance.post<{ created: number; requested: number }>(`${BASE}/bulk`, payload);
    return r.data;
  },

  /** Remove a schedule entry by id */
  async removeOne(id: number): Promise<void> {
    await axiosInstance.delete(`${BASE}/${id}`);
  },

  /** List day-off records for a date range */
  async listDayOffs(params: { dateFrom: string; dateTo: string; departmentId?: number }): Promise<DayOff[]> {
    const r = await axiosInstance.get<DayOff[]>(`${BASE}/day-offs`, { params });
    return r.data;
  },

  /** Assign or update a day-off record */
  async assignDayOff(payload: { employeeId: number; date: string; offType: string; note?: string }): Promise<DayOff> {
    const r = await axiosInstance.post<DayOff>(`${BASE}/day-offs`, payload);
    return r.data;
  },

  /** Remove a day-off record */
  async removeDayOff(id: number): Promise<void> {
    await axiosInstance.delete(`${BASE}/day-offs/${id}`);
  },
};
