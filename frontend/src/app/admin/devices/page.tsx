'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button as AntButton, Modal, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RotateCw, Power, PowerOff } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { FacetedFilter, FilterResetButton } from '@/components/ui/FacetedFilter';
import { DataTable } from '@/components/antd/data-table';
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
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'hr') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deviceService.list({ page, limit, isActive: filterActive });
      setDevices(res.data as DeviceRow[]);
      setTotal(res.total);
    } catch {
      message.error('Không thể tải danh sách thiết bị.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterActive]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  function handleToggle(device: DeviceRow) {
    const willActivate = !device.isActive;
    Modal.confirm({
      title: willActivate
        ? `Kích hoạt thiết bị "${device.deviceName ?? 'không tên'}" của ${device.employee?.fullName ?? '—'}?`
        : `Vô hiệu hóa thiết bị "${device.deviceName ?? 'không tên'}" của ${device.employee?.fullName ?? '—'}?`,
      content: willActivate ? undefined : 'Nhân viên sẽ không thể chấm công bằng thiết bị này nữa.',
      okText: 'Xác nhận',
      cancelText: 'Hủy',
      okButtonProps: { danger: !willActivate },
      onOk: async () => {
        try {
          await deviceService.update(device.id, { isActive: willActivate });
          message.success(`Đã ${willActivate ? 'kích hoạt' : 'vô hiệu hóa'} thiết bị.`);
          await fetchDevices();
        } catch {
          message.error('Thao tác thất bại.');
        }
      },
    });
  }

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) =>
      d.employee?.fullName?.toLowerCase().includes(q) ||
      d.employee?.code?.toLowerCase().includes(q) ||
      d.deviceName?.toLowerCase().includes(q),
    );
  }, [devices, search]);

  const columns: ColumnsType<DeviceRow> = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_, device) => (
        <span className="whitespace-nowrap">
          <span className="font-medium">{device.employee?.fullName ?? '—'}</span>
          <span className="ml-1 text-xs text-gray-400">({device.employee?.code ?? device.employeeId})</span>
        </span>
      ),
    },
    {
      title: 'Tên thiết bị',
      key: 'deviceName',
      render: (_, device) => <span className="text-gray-700">{device.deviceName ?? '—'}</span>,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      align: 'center',
      render: (_, device) => (
        <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${device.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {device.isActive ? 'Hoạt động' : 'Vô hiệu'}
        </span>
      ),
    },
    {
      title: 'Đăng ký bởi',
      key: 'registeredBy',
      responsive: ['md'],
      render: (_, device) => <span className="text-xs text-gray-500">{device.registeredBy?.fullName ?? '—'}</span>,
    },
    {
      title: 'Ngày đăng ký',
      key: 'registeredAt',
      responsive: ['lg'],
      render: (_, device) => <span className="whitespace-nowrap text-xs text-gray-500">{new Date(device.registeredAt).toLocaleDateString('vi-VN')}</span>,
    },
    {
      title: 'Dùng lần cuối',
      key: 'lastUsedAt',
      responsive: ['lg'],
      render: (_, device) => (
        <span className="whitespace-nowrap text-xs text-gray-500">
          {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleDateString('vi-VN') : '—'}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'center',
      width: 60,
      render: (_, device) => (
        <AntButton
          size="small"
          color={device.isActive ? 'danger' : 'green'}
          variant="outlined"
          icon={device.isActive ? <PowerOff size={14} /> : <Power size={14} />}
          title={device.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
          aria-label={device.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
          onClick={() => handleToggle(device)}
        />
      ),
    },
  ];

  return (
    <AppShell title="Quản lý thiết bị">
      <div className="space-y-4">

        {/* Toolbar: filters (left) + actions (right) — reference: booking list toolbar */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-full sm:w-64">
              <Input
                placeholder="Tên nhân viên, mã hoặc tên thiết bị..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <FacetedFilter
              label="Trạng thái"
              options={[
                { value: 'active', label: 'Đang hoạt động' },
                { value: 'inactive', label: 'Vô hiệu' },
              ]}
              selected={filterActive === undefined ? [] : [filterActive ? 'active' : 'inactive']}
              onChange={(v) => { setPage(1); setFilterActive(v[0] === undefined ? undefined : v[0] === 'active'); }}
              singleSelect
              showSearch={false}
              clearLabel="Bỏ chọn"
              panelWidth={180}
            />

            <FilterResetButton
              show={!!search || filterActive !== undefined}
              onClick={() => { setSearch(''); setFilterActive(undefined); setPage(1); }}
              label="Xóa lọc"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => fetchDevices()}
              disabled={loading}
              aria-label="Làm mới"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCw size={15} className={loading ? 'animate-spin' : undefined} />
            </button>
          </div>
        </div>

        {loading ? (
          <PageSpinner />
        ) : devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-400">Không có thiết bị nào.</div>
        ) : (
          <DataTable<DeviceRow>
            bordered
            rowKey="id"
            columns={columns}
            dataSource={filteredDevices}
            page={page}
            pageSize={limit}
            total={total}
            onPageChange={(p, pageSize) => { if (pageSize !== limit) { setLimit(pageSize); setPage(1); } else setPage(p); }}
            pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
            locale={{ emptyText: 'Không có thiết bị nào.' }}
            scroll={{ x: 'max-content' }}
          />
        )}
      </div>
    </AppShell>
  );
}
