import api from '@/lib/axios';

export interface RegisteredDevice {
  id: number;
  employeeId: number;
  deviceFingerprint: string;
  deviceName: string | null;
  userAgent: string | null;
  isActive: boolean;
  registeredAt: string;
  lastUsedAt: string | null;
}

export const deviceService = {
  registerMine: (payload: { deviceFingerprint: string; deviceName?: string; userAgent?: string }) =>
    api.post<{ data: RegisteredDevice }>('/devices/register', payload).then((r) => r.data),

  listMine: () =>
    api.get<{ data: RegisteredDevice[] }>('/devices/me').then((r) => r.data),

  deactivateMine: (id: number) =>
    api.delete<{ data: RegisteredDevice }>(`/devices/me/${id}`).then((r) => r.data),

  // Admin / HR
  list: (params?: { employeeId?: number; isActive?: boolean; page?: number; limit?: number }) =>
    api.get<{ data: RegisteredDevice[]; total: number; page: number; limit: number }>('/devices', { params }).then((r) => r.data),

  update: (id: number, body: { isActive?: boolean; deviceName?: string }) =>
    api.patch<{ data: RegisteredDevice }>(`/devices/${id}`, body).then((r) => r.data),

  deactivate: (id: number) =>
    api.delete<{ data: RegisteredDevice }>(`/devices/${id}`).then((r) => r.data),
};
