'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { useTranslation } from 'react-i18next';
import { systemConfigService, type SystemConfig } from '@/services/system-config.service';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchConfigs() {
      try {
        const data = await systemConfigService.getAll();
        setConfigs(data);
        const values: Record<string, string> = {};
        data.forEach(c => {
          values[c.key] = c.value;
        });
        setLocalValues(values);
      } catch (err) {
        setError(t('settings.failedToLoad'));
      } finally {
        setLoading(false);
      }
    }
    fetchConfigs();
  }, [t]);

  async function handleUpdate(key: string) {
    setSaving(key);
    setError('');
    try {
      await systemConfigService.update(key, localValues[key]);
    } catch (err) {
      setError(`Failed to update ${key}.`);
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <AppShell title={t('settings.title')}><PageSpinner /></AppShell>;

  const telegramConfigs = configs.filter(c => c.key.startsWith('telegram_'));
  const deviceCheckEnabled = localValues['device_check_enabled'] === 'true';
  const deviceMaxPerEmployee = localValues['device_max_per_employee'] ?? '2';
  const excludeAttendanceExempt = localValues['report_exclude_attendance_exempt'] === 'true';

  return (
    <AppShell title={t('settings.title')}>
      <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
            {t('settings.notificationSettings')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{t('settings.notificationDesc')}</p>
        </div>

        {error && <Alert variant="error" message={error} className="glassmorphism-alert" />}

        {/* Telegram Configuration Card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/60 backdrop-blur-xl shadow-lg transition-all hover:shadow-indigo-500/10">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">{t('settings.telegramBot')}</h3>
            </div>
          </div>

          <div className="divide-y divide-gray-100 p-6 space-y-6">
            {telegramConfigs.length === 0 && <p className="text-gray-500 text-sm italic">{t('settings.noTelegramConfig')}</p>}

            {telegramConfigs.map((c) => (
              <div key={c.key} className="pt-6 first:pt-0 group">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      {c.description || c.key.replace(/_/g, ' ').toUpperCase()}
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 uppercase">{c.key}</span>
                    </label>
                    {c.key === 'telegram_reminder_message' ? (
                      <textarea
                        title={c.description || c.key}
                        aria-label={c.description || c.key}
                        placeholder={c.description || c.key}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                        rows={3}
                        value={localValues[c.key] || ''}
                        onChange={(e) => setLocalValues(prev => ({ ...prev, [c.key]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        title={c.description || c.key}
                        aria-label={c.description || c.key}
                        type={c.key === 'telegram_bot_token' ? "password" : "text"}
                        placeholder={c.key === 'telegram_reminder_time' ? "HH:mm" : ""}
                        value={localValues[c.key] || ''}
                        onChange={(e) => setLocalValues(prev => ({ ...prev, [c.key]: e.target.value }))}
                        className="bg-gray-50/50 transition-all focus:bg-white"
                      />
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    loading={saving === c.key}
                    onClick={() => handleUpdate(c.key)}
                    className="sm:w-24 shadow-sm hover:translate-y-[-1px] active:translate-y-[0px] transition-all"
                  >
                    {t('common.update')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex gap-4">
          <div className="text-amber-500 mt-1">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-amber-800">{t('settings.reminderScheduleNote')}</h4>
            <p className="mt-1 text-xs text-amber-700 leading-relaxed">
              {t('settings.reminderScheduleDesc')}
            </p>
          </div>
        </div>

        {/* Device Configuration Card */}
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600">
            Cài đặt thiết bị
          </h2>
          <p className="mt-1 text-sm text-gray-500">Quản lý giới hạn thiết bị và chế độ xác thực khi chấm công.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/60 backdrop-blur-xl shadow-lg transition-all hover:shadow-emerald-500/10">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Thiết bị chấm công</h3>
          </div>

          <div className="divide-y divide-gray-100 p-6 space-y-6">
            {/* Max devices per employee */}
            <div className="group">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1 space-y-1.5">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    Số thiết bị tối đa
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 uppercase">device_max_per_employee</span>
                  </label>
                  <p className="text-xs text-gray-500">Số thiết bị tối đa mỗi nhân viên được phép đăng ký.</p>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={deviceMaxPerEmployee}
                    onChange={(e) => setLocalValues(prev => ({ ...prev, device_max_per_employee: e.target.value }))}
                    className="w-32 bg-gray-50/50 transition-all focus:bg-white"
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  loading={saving === 'device_max_per_employee'}
                  onClick={() => handleUpdate('device_max_per_employee')}
                  className="sm:w-24 shadow-sm hover:translate-y-[-1px] active:translate-y-[0px] transition-all"
                >
                  {t('common.update')}
                </Button>
              </div>
            </div>

            {/* Device check global toggle */}
            <div className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    Bật chế độ kiểm tra thiết bị
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 uppercase">device_check_enabled</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Khi bật, hệ thống sẽ kiểm tra thiết bị theo cấu hình từng nhân viên (STRICT / WARN). Khi tắt, tất cả chấm công được cho qua.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deviceCheckEnabled}
                  onClick={async () => {
                    const newVal = (!deviceCheckEnabled).toString();
                    setLocalValues(prev => ({ ...prev, device_check_enabled: newVal }));
                    setSaving('device_check_enabled');
                    setError('');
                    try {
                      await systemConfigService.update('device_check_enabled', newVal);
                    } catch {
                      setError('Failed to update device_check_enabled.');
                      setLocalValues(prev => ({ ...prev, device_check_enabled: deviceCheckEnabled.toString() }));
                    } finally {
                      setSaving(null);
                    }
                  }}
                  disabled={saving === 'device_check_enabled'}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${deviceCheckEnabled ? 'bg-emerald-500' : 'bg-gray-200'} disabled:opacity-50`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${deviceCheckEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              {saving === 'device_check_enabled' && (
                <p className="mt-2 text-xs text-gray-400">Đang lưu...</p>
              )}
            </div>
          </div>
        </div>

        {/* Attendance Report Configuration Card */}
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-orange-600">
            Cài đặt báo cáo chấm công
          </h2>
          <p className="mt-1 text-sm text-gray-500">Quy định cách nhân viên ưu tiên (miễn chấm công) xuất hiện trong báo cáo.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/60 backdrop-blur-xl shadow-lg transition-all hover:shadow-amber-500/10">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-amber-600 text-white shadow-lg shadow-amber-200">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Nhân viên ưu tiên trong báo cáo</h3>
          </div>

          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  Loại nhân viên ưu tiên khỏi báo cáo
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 uppercase">report_exclude_attendance_exempt</span>
                </p>
                <p className="text-xs text-gray-500">
                  Tắt (mặc định): báo cáo chấm công tính tất cả nhân viên. Bật: báo cáo sẽ loại bỏ các nhân viên được đánh dấu &quot;ưu tiên — miễn chấm công&quot;.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={excludeAttendanceExempt}
                onClick={async () => {
                  const newVal = (!excludeAttendanceExempt).toString();
                  setLocalValues(prev => ({ ...prev, report_exclude_attendance_exempt: newVal }));
                  setSaving('report_exclude_attendance_exempt');
                  setError('');
                  try {
                    await systemConfigService.update('report_exclude_attendance_exempt', newVal);
                  } catch {
                    setError('Failed to update report_exclude_attendance_exempt.');
                    setLocalValues(prev => ({ ...prev, report_exclude_attendance_exempt: excludeAttendanceExempt.toString() }));
                  } finally {
                    setSaving(null);
                  }
                }}
                disabled={saving === 'report_exclude_attendance_exempt'}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${excludeAttendanceExempt ? 'bg-amber-500' : 'bg-gray-200'} disabled:opacity-50`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${excludeAttendanceExempt ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
            {saving === 'report_exclude_attendance_exempt' && (
              <p className="mt-2 text-xs text-gray-400">Đang lưu...</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
