'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button as AntButton, Modal, message } from 'antd';
import { PowerOff, Laptop2, CalendarDays, Clock3 } from 'lucide-react';
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {isActive ? 'Hoạt động' : 'Vô hiệu'}
    </span>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await deviceService.listMine();
      setDevices(res.data);
    } catch {
      message.error('Không thể tải danh sách thiết bị.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const activeCount = devices.filter((d) => d.isActive).length;
  const atLimit = activeCount >= MAX_DEVICES;

  async function handleRegister() {
    setRegistering(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const deviceName = `${navigator.platform} · ${new Date().toLocaleDateString('vi-VN')}`;
      await deviceService.registerMine({ deviceFingerprint: fingerprint, deviceName, userAgent: navigator.userAgent });
      message.success('Đã đăng ký thiết bị này thành công.');
      await fetchDevices();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Đăng ký thất bại. Vui lòng thử lại.';
      message.error(msg);
    } finally {
      setRegistering(false);
    }
  }

  function handleDeactivate(id: number) {
    Modal.confirm({
      title: 'Vô hiệu hóa thiết bị này?',
      content: 'Bạn sẽ không thể chấm công bằng thiết bị này nữa cho đến khi đăng ký lại.',
      okText: 'Xác nhận',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deviceService.deactivateMine(id);
          message.success('Đã vô hiệu hóa thiết bị.');
          await fetchDevices();
        } catch {
          message.error('Không thể vô hiệu hóa thiết bị.');
        }
      },
    });
  }

  return (
    <AppShell title="Thiết bị của tôi">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Quản lý thiết bị được phép chấm công. Tối đa {MAX_DEVICES} thiết bị.
          </p>
          <Button
            onClick={handleRegister}
            disabled={atLimit || registering}
            title={atLimit ? `Đã đạt giới hạn ${MAX_DEVICES} thiết bị` : ''}
            className="w-full shrink-0 sm:w-auto"
          >
            {registering ? 'Đang đăng ký...' : '+ Đăng ký thiết bị này'}
          </Button>
        </div>

        {atLimit && (
          <Alert variant="warning" message={`Bạn đã đạt giới hạn ${MAX_DEVICES} thiết bị. Vô hiệu hóa thiết bị cũ để thêm mới.`} className="mb-4" />
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
                className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                    device.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <Laptop2 size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-gray-900">
                      {device.deviceName ?? 'Thiết bị không tên'}
                    </h3>
                    <DeviceStatusBadge isActive={device.isActive} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays size={13} className="text-gray-400" />
                      Đăng ký {new Date(device.registeredAt).toLocaleDateString('vi-VN')}
                    </span>
                    {device.lastUsedAt && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={13} className="text-gray-400" />
                        Dùng lần cuối {new Date(device.lastUsedAt).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                  </div>

                  {device.userAgent && (
                    <p
                      className="mt-2 truncate font-mono text-[11px] text-gray-300"
                      title={device.userAgent}
                    >
                      {device.userAgent.slice(0, 80)}
                    </p>
                  )}
                </div>

                {device.isActive && (
                  <AntButton
                    size="small"
                    color="danger"
                    variant="outlined"
                    icon={<PowerOff size={14} />}
                    className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                    title="Vô hiệu hóa"
                    aria-label="Vô hiệu hóa"
                    onClick={() => handleDeactivate(device.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
