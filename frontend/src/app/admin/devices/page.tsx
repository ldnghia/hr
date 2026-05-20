'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { deviceService, type RegisteredDevice } from '@/services/device.service';
import { useAuth } from '@/context/AuthContext';

interface DeviceRow extends RegisteredDevice {
  employee?: { id: number; fullName: string | null; code: string | null };
  registeredBy?: { id: number; fullName: string | null };
}

export default function AdminDevicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'hr') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deviceService.list({ page, limit: 20, isActive: filterActive });
      setDevices(res.data as DeviceRow[]);
      setTotal(res.total);
    } catch {
      setActionMsg({ type: 'error', text: 'Không thể tải danh sách thiết bị.' });
    } finally {
      setLoading(false);
    }
  }, [page, filterActive]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  async function handleToggle(device: DeviceRow) {
    setActionMsg(null);
    try {
      await deviceService.update(device.id, { isActive: !device.isActive });
      setActionMsg({
        type: 'success',
        text: `Đã ${device.isActive ? 'vô hiệu hóa' : 'kích hoạt'} thiết bị.`,
      });
      await fetchDevices();
    } catch {
      setActionMsg({ type: 'error', text: 'Thao tác thất bại.' });
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quản lý thiết bị</h1>
            <p className="text-sm text-gray-500 mt-1">Tổng: {total} thiết bị</p>
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'inactive'] as const).map((f) => {
              const active = f === 'all' ? filterActive === undefined : f === 'active' ? filterActive === true : filterActive === false;
              return (
                <button
                  key={f}
                  onClick={() => {
                    setPage(1);
                    setFilterActive(f === 'all' ? undefined : f === 'active');
                  }}
                  className={`px-3 py-1 rounded text-sm ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {f === 'all' ? 'Tất cả' : f === 'active' ? 'Đang hoạt động' : 'Vô hiệu'}
                </button>
              );
            })}
          </div>
        </div>

        {actionMsg && (
          <Alert variant={actionMsg.type === 'success' ? 'success' : 'error'} message={actionMsg.text} className="mb-4" />
        )}

        {loading ? (
          <PageSpinner />
        ) : devices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Không có thiết bị nào.</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3">Nhân viên</th>
                    <th className="text-left px-4 py-3">Tên thiết bị</th>
                    <th className="text-left px-4 py-3">Trạng thái</th>
                    <th className="text-left px-4 py-3">Đăng ký bởi</th>
                    <th className="text-left px-4 py-3">Ngày đăng ký</th>
                    <th className="text-left px-4 py-3">Dùng lần cuối</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {devices.map((device) => (
                    <tr key={device.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium">{device.employee?.fullName ?? '—'}</span>
                        <span className="text-gray-400 text-xs ml-1">({device.employee?.code ?? device.employeeId})</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{device.deviceName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${device.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {device.isActive ? 'Hoạt động' : 'Vô hiệu'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{device.registeredBy?.fullName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(device.registeredAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant={device.isActive ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggle(device)}
                        >
                          {device.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  ← Trước
                </Button>
                <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  Sau →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
