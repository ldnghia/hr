'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AntButton, Modal, DatePicker, Alert, Spin } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import { attendanceService } from '@/services/attendance.service';
import { employeeService } from '@/services/employee.service';
import type { AttendanceRecord } from '@/types';
import { CorrectionRequestList } from '@/app/attendance/components/correction-request-list';
import { CorrectionAdminPanel } from '@/app/attendance/components/correction-admin-panel';
import { CorrectionRequestFormModal } from '@/app/attendance/components/correction-request-form-modal';
import { CorrectionWithoutRecordModal } from '@/app/attendance/components/correction-without-record-modal';
import { formatDateTime } from '@/utils/format';

// ─── New Correction Picker ────────────────────────────────────────────────────

function NewCorrectionPicker({ onClose, onSuccess, workingMode }: { onClose: () => void; onSuccess: () => void; workingMode: string }) {
  const { t } = useTranslation();
  const today = dayjs().format('YYYY-MM-DD');
  const [date, setDate] = useState(today);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [createWithoutRecord, setCreateWithoutRecord] = useState(false);

  const search = useCallback(async () => {
    if (!date) return;
    setLoading(true); setError(''); setRecords([]);
    try {
      const res = await attendanceService.me({ dateFrom: date, dateTo: date, limit: 10 });
      const list = res.data ?? [];
      if (list.length === 0) setError('Không tìm thấy bản ghi chấm công cho ngày này.');
      else setRecords(list);
    } catch {
      setError('Không thể tải dữ liệu chấm công.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { search(); }, [search]);

  if (selected) {
    return (
      <CorrectionRequestFormModal
        attendance={selected}
        isOpen
        onClose={() => setSelected(null)}
        onSuccess={() => { onSuccess(); onClose(); }}
      />
    );
  }

  if (createWithoutRecord) {
    return (
      <CorrectionWithoutRecordModal
        date={date}
        workingMode={workingMode}
        onClose={() => setCreateWithoutRecord(false)}
        onSuccess={() => { onSuccess(); onClose(); }}
      />
    );
  }

  return (
    <Modal open onCancel={onClose} title="Tạo yêu cầu điều chỉnh" footer={null}>
      <div className="space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Chọn ngày</label>
            <DatePicker
              value={dayjs(date)}
              maxDate={dayjs(today)}
              onChange={(val: Dayjs | null) => setDate(val ? val.format('YYYY-MM-DD') : today)}
              format="DD/MM/YYYY"
              className="w-full"
              allowClear={false}
            />
          </div>
          <AntButton onClick={search} loading={loading}>Tìm</AntButton>
        </div>

        {error && (
          <div className="space-y-2">
            <Alert type="error" title={error} />
            <button
              onClick={() => setCreateWithoutRecord(true)}
              className="w-full rounded-lg border border-dashed border-indigo-300 p-3 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              + Tạo yêu cầu cho ngày {date} (chưa có bản ghi chấm công)
            </button>
          </div>
        )}

        {loading && <div className="flex justify-center py-4"><Spin /></div>}

        {!loading && records.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {records.length} bản ghi — chọn để điều chỉnh
            </p>
            {records.map((rec) => (
              <button
                key={rec.id}
                onClick={() => setSelected(rec)}
                className="w-full rounded-lg border border-gray-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {rec.shift?.name ?? 'Ca làm việc'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Vào: {rec.checkinTime ? formatDateTime(rec.checkinTime) : '—'}
                      {' · '}
                      Ra: {rec.checkoutTime ? formatDateTime(rec.checkoutTime) : '—'}
                    </p>
                  </div>
                  <span className="text-xs text-indigo-600 font-medium">Chọn →</span>
                </div>
              </button>
            ))}

            {/* SHIFT employees may work multiple shifts per day — allow creating correction for a shift not in the list */}
            {workingMode === 'SHIFT' && (
              <button
                onClick={() => setCreateWithoutRecord(true)}
                className="w-full rounded-lg border border-dashed border-indigo-300 p-3 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                + Tạo yêu cầu cho ca khác trong ngày {date}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CorrectionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';

  const [activeTab, setActiveTab] = useState<'mine' | 'manage'>('mine');
  const [showPicker, setShowPicker] = useState(false);
  const [listKey, setListKey] = useState(0);
  const [workingMode, setWorkingMode] = useState('FIXED');

  useEffect(() => {
    if (!user) return;
    employeeService.get(user.id).then((emp) => {
      setWorkingMode(emp.workingMode ?? 'FIXED');
    }).catch(() => {});
  }, [user]);

  // Admin/HR land on "Quản lý yêu cầu" by default — that's the actionable tab for their role.
  useEffect(() => {
    if (isAdminOrHr) setActiveTab('manage');
  }, [isAdminOrHr]);

  const tabs = [
    ...(isAdminOrHr ? [{ key: 'manage', label: 'Quản lý yêu cầu' }] : []),
    { key: 'mine', label: 'Yêu cầu của tôi' },
  ] as const;

  const newRequestButton = (
    <AntButton type="primary" icon={<Plus size={14} />} onClick={() => setShowPicker(true)}>
      Tạo yêu cầu mới
    </AntButton>
  );

  return (
    <AppShell title="Yêu cầu điều chỉnh chấm công">
      <div className="space-y-4">

        {/* Tabs */}
        {isAdminOrHr && (
          <div className="flex gap-4 border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as 'mine' | 'manage')}
                className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {activeTab === 'mine' && <CorrectionRequestList key={listKey} actionSlot={newRequestButton} />}
        {activeTab === 'manage' && isAdminOrHr && <CorrectionAdminPanel actionSlot={newRequestButton} />}

      </div>

      {/* New correction date picker */}
      {showPicker && (
        <NewCorrectionPicker
          workingMode={workingMode}
          onClose={() => setShowPicker(false)}
          onSuccess={() => setListKey((k) => k + 1)}
        />
      )}
    </AppShell>
  );
}
