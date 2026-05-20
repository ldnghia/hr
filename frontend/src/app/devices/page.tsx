'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { deviceService, type RegisteredDevice } from '@/services/device.service';
import { getDeviceFingerprint } from '@/lib/device-fingerprint';

const MAX_DEVICES = 2;

function DeviceStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isActive ? 'Hoạt động' : 'Vô hiệu'}
    </span>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [registering, setRegistering] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await deviceService.listMine();
      setDevices(res.data);
    } catch {
      setActionMsg({ type: 'error', text: 'Không thể tải danh sách thiết bị.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const activeCount = devices.filter((d) => d.isActive).length;
  const atLimit = activeCount >= MAX_DEVICES;

  async function handleRegister() {
    setRegistering(true);
    setActionMsg(null);
    try {
      const fingerprint = await getDeviceFingerprint();
      const deviceName = `${navigator.platform} · ${new Date().toLocaleDateString('vi-VN')}`;
      await deviceService.registerMine({ deviceFingerprint: fingerprint, deviceName, userAgent: navigator.userAgent });
      setActionMsg({ type: 'success', text: 'Đã đăng ký thiết bị này thành công.' });
      await fetchDevices();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Đăng ký thất bại. Vui lòng thử lại.';
      setActionMsg({ type: 'error', text: msg });
    } finally {
      setRegistering(false);
    }
  }

  async function handleDeactivate(id: number) {
    setActionMsg(null);
    try {
      await deviceService.deactivateMine(id);
      setActionMsg({ type: 'success', text: 'Đã vô hiệu hóa thiết bị.' });
      await fetchDevices();
    } catch {
      setActionMsg({ type: 'error', text: 'Không thể vô hiệu hóa thiết bị.' });
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Thiết bị của tôi</h1>
            <p className="text-sm text-gray-500 mt-1">
              Quản lý thiết bị được phép chấm công. Tối đa {MAX_DEVICES} thiết bị.
            </p>
          </div>
          <Button
            onClick={handleRegister}
            disabled={atLimit || registering}
            title={atLimit ? `Đã đạt giới hạn ${MAX_DEVICES} thiết bị` : ''}
          >
            {registering ? 'Đang đăng ký...' : '+ Đăng ký thiết bị này'}
          </Button>
        </div>

        {atLimit && (
          <Alert variant="warning" message={`Bạn đã đạt giới hạn ${MAX_DEVICES} thiết bị. Vô hiệu hóa thiết bị cũ để thêm mới.`} className="mb-4" />
        )}

        {actionMsg && (
          <Alert variant={actionMsg.type === 'success' ? 'success' : 'error'} message={actionMsg.text} className="mb-4" />
        )}

        {loading ? (
          <PageSpinner />
        ) : devices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Chưa có thiết bị nào được đăng ký.</div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-white"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 truncate">
                      {device.deviceName ?? 'Thiết bị không tên'}
                    </span>
                    <DeviceStatusBadge isActive={device.isActive} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Đăng ký: {new Date(device.registeredAt).toLocaleDateString('vi-VN')}
                    {device.lastUsedAt && (
                      <> · Dùng lần cuối: {new Date(device.lastUsedAt).toLocaleDateString('vi-VN')}</>
                    )}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5 truncate max-w-sm" title={device.userAgent ?? ''}>
                    {device.userAgent?.slice(0, 60)}
                  </p>
                </div>
                {device.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 ml-4 shrink-0"
                    onClick={() => handleDeactivate(device.id)}
                  >
                    Vô hiệu hóa
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
