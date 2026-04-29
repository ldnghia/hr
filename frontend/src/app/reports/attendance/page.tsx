'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { attendanceService } from '@/services/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, formatDateFile } from '@/utils/format';
import type { AttendanceRecord } from '@/types';
import {
  ClipboardList, Clock, AlertTriangle, LogOut,
  RotateCcw, Search, Hash, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronDown, LayoutGrid, List, CalendarDays,
} from 'lucide-react';

// ─── Month Picker Modal ───────────────────────────────────────────────────────

const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                 'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

interface MonthPickerModalProps {
  onConfirm: (year: number, month: number) => void;
  onClose: () => void;
  loading?: boolean;
  title?: string;
  subtitle?: string;
}

function MonthPickerModal({ onConfirm, onClose, loading, title, subtitle }: MonthPickerModalProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-base">{title ?? 'Chọn tháng xuất báo cáo'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle ?? 'Bảng chấm công dạng lưới S/C'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            ✕
          </button>
        </div>

        {/* Year selector */}
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2">
          <button onClick={() => setYear(y => y - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500">
            <ChevronLeft size={16} />
          </button>
          <span className="font-bold text-gray-800 text-lg">{year}</span>
          <button onClick={() => setYear(y => y + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-4 gap-2">
          {MONTHS.map((label, i) => {
            const m = i + 1;
            const isSelected = m === month;
            const isCurrent = m === now.getMonth() + 1 && year === now.getFullYear();
            return (
              <button key={m} onClick={() => setMonth(m)}
                className={`py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : isCurrent
                      ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
            Hủy
          </button>
          <button onClick={() => onConfirm(year, month)} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <LayoutGrid size={14} />}
            Xuất Excel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
}

const AVATAR_COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500'];
function avatarColor(name?: string) {
  const sum = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusCell({ record }: { record: AttendanceRecord }) {
  const { t } = useTranslation();
  if (!record.checkinTime) return <span className="text-gray-300 text-xs">—</span>;
  const badges = [];
  if (record.isLate) badges.push(<Badge key="l" label={t('attendance.late')} variant="danger" />);
  if (record.isEarlyOut) badges.push(<Badge key="e" label={t('attendance.earlyOut')} variant="warning" />);
  if (record.isOvertime) badges.push(<Badge key="o" label={`OT ${Number(record.overtimeHours).toFixed(1)}h`} variant="info" />);
  if (!badges.length) return <Badge label={t('attendance.normal')} variant="success" />;
  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

interface StatCardProps {
  label: string; value: string; sub?: string;
  gradient: string; icon: React.ReactNode;
}
function StatCard({ label, value, sub, gradient, icon }: StatCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white ${gradient}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-75 mb-1">{label}</p>
          <p className="text-3xl font-black truncate">{value}</p>
          {sub && <p className="text-xs mt-1 opacity-60 truncate">{sub}</p>}
        </div>
        <div className="p-2.5 rounded-xl bg-white/20 shrink-0">{icon}</div>
      </div>
      <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceReportPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const todayDate = new Date();
  const defaultFrom = toYmd(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const defaultTo = toYmd(todayDate);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalHours, setTotalHours] = useState(0);
  const [filters, setFilters] = useState({
    dateFrom: defaultFrom, dateTo: defaultTo,
    employeeName: '', employeeCode: '',
    isLate: undefined as boolean | undefined,
    isEarlyOut: undefined as boolean | undefined,
  });
  const [search, setSearch] = useState({ employeeName: '', employeeCode: '' });

  useEffect(() => {
    setSearch({ employeeName: filters.employeeName, employeeCode: filters.employeeCode });
  }, [filters.employeeName, filters.employeeCode]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attendanceService.report({ page, limit, ...filters });
      setData(res.data);
      setTotal(res.meta.total);
      setTotalHours(res.summary?.totalWorkingHours || 0);
    } catch (err) {
      console.error('[report] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const [activePreset, setActivePreset] = useState<string>('month');
  const [filterMonthOpen, setFilterMonthOpen] = useState(false);
  const [filterPickYear, setFilterPickYear] = useState(todayDate.getFullYear());
  const [exportOpen, setExportOpen] = useState(false);
  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [gridExporting, setGridExporting] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryExporting, setSummaryExporting] = useState(false);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    try {
      setExportOpen(false);
      const res = await attendanceService.export(filters);
      triggerDownload(new Blob([res.data]), `Bao_Cao_Cham_Cong_${formatDateFile()}.xlsx`);
    } catch { alert('Export failed'); }
  };

  const handleExportGrid = async (year: number, month: number) => {
    setGridExporting(true);
    try {
      const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const res = await attendanceService.exportGrid({ ...filters, dateFrom, dateTo });
      triggerDownload(new Blob([res.data]), `Bang_Cham_Cong_T${String(month).padStart(2, '0')}_${year}.xlsx`);
      setGridModalOpen(false);
    } catch { alert('Export grid failed'); }
    finally { setGridExporting(false); }
  };

  const handleExportSummary = async (year: number, month: number) => {
    setSummaryExporting(true);
    try {
      const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const res = await attendanceService.exportSummary({ dateFrom, dateTo });
      triggerDownload(new Blob([res.data]), `Bao_Cao_Ngay_Cong_T${String(month).padStart(2, '0')}_${year}.xlsx`);
      setSummaryModalOpen(false);
    } catch { alert('Export summary failed'); }
    finally { setSummaryExporting(false); }
  };

  const applyPreset = (preset: string) => {
    const now = new Date();
    let start: Date, end: Date;
    if (preset === 'today') { start = end = now; }
    else if (preset === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); end = now; }
    else if (preset === 'last1') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
    else if (preset === 'last2') { start = new Date(now.getFullYear(), now.getMonth() - 2, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
    else return;
    setFilters(f => ({ ...f, dateFrom: toYmd(start), dateTo: toYmd(end) }));
    setActivePreset(preset);
    setPage(1);
  };

  const applyFilterMonth = (year: number, month: number) => {
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    setFilters(f => ({ ...f, dateFrom, dateTo }));
    setActivePreset(`pick-${year}-${month}`);
    setFilterMonthOpen(false);
    setPage(1);
  };

  const resetFilters = () => {
    setActivePreset('month');
    setFilters({ dateFrom: defaultFrom, dateTo: defaultTo, employeeName: '', employeeCode: '', isLate: undefined, isEarlyOut: undefined });
    setPage(1);
  };

  const commitSearch = (field: 'employeeName' | 'employeeCode') => {
    if (search[field] !== filters[field]) {
      setFilters(f => ({ ...f, [field]: search[field] }));
      setPage(1);
    }
  };

  const stats = useMemo(() => ({
    late: data.filter(r => r.isLate).length,
    earlyOut: data.filter(r => r.isEarlyOut).length,
  }), [data]);

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<AttendanceRecord>[] = [
    {
      key: 'employee',
      header: t('reports.colEmployee'),
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(r.employee?.fullName)}`}>
            {getInitials(r.employee?.fullName)}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">{r.employee?.fullName}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{r.employee?.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'date',
      header: t('reports.colDay'),
      render: (r) => <span className="text-sm font-medium text-gray-700">{formatDate(r.date)}</span>,
    },
    {
      key: 'checkinTime',
      header: t('reports.colCheckin'),
      render: (r) => (
        <div>
          <span className={`text-sm font-semibold ${r.isLate ? 'text-red-500' : 'text-gray-800'}`}>
            {r.checkinTime ? formatDateTime(r.checkinTime).split(' ')[1] : <span className="text-gray-300 font-normal">—:—</span>}
          </span>
          {r.checkinNote && <p className="text-[10px] text-amber-600 italic truncate max-w-[90px] mt-0.5">"{r.checkinNote}"</p>}
        </div>
      ),
    },
    {
      key: 'checkoutTime',
      header: t('reports.colCheckout'),
      render: (r) => (
        <div>
          <span className={`text-sm font-semibold ${r.isEarlyOut ? 'text-amber-500' : 'text-gray-800'}`}>
            {r.checkoutTime ? formatDateTime(r.checkoutTime).split(' ')[1] : <span className="text-gray-300 font-normal">—:—</span>}
          </span>
          {r.checkoutNote && <p className="text-[10px] text-amber-600 italic truncate max-w-[90px] mt-0.5">"{r.checkoutNote}"</p>}
        </div>
      ),
    },
    {
      key: 'workingHours',
      header: t('reports.colHours'),
      render: (r) => {
        const h = Number(r.workingHours || 0);
        const cls = h >= 8 ? 'text-emerald-600' : h >= 4 ? 'text-amber-500' : 'text-red-500';
        return <span className={`font-mono font-bold text-sm ${cls}`}>{h.toFixed(2)}h</span>;
      },
    },
    {
      key: 'status',
      header: t('reports.colStatus'),
      render: (r) => <StatusCell record={r} />,
    },
  ];

  const totalPages = Math.ceil(total / limit);
  const pageStart = Math.max(1, Math.min(page - 2, totalPages - 4));

  return (
    <AppShell title={t('reports.attendance')}>
      {gridModalOpen && (
        <MonthPickerModal
          loading={gridExporting}
          onConfirm={handleExportGrid}
          onClose={() => setGridModalOpen(false)}
        />
      )}
      {summaryModalOpen && (
        <MonthPickerModal
          title="Báo cáo số ngày công"
          subtitle="Tổng hợp ngày công theo tháng"
          loading={summaryExporting}
          onConfirm={handleExportSummary}
          onClose={() => setSummaryModalOpen(false)}
        />
      )}
      <div className="space-y-5">

        {/* ── Filter Card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">

          {/* Row 1 — Date range + Quick presets + Actions */}
          <div className="flex flex-wrap items-end gap-3 px-5 py-4">
            {/* Date inputs */}
            <div className="flex items-end gap-2 shrink-0">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block">{t('reports.fromDate')}</label>
                <Input type="date" value={filters.dateFrom} className="w-36"
                  onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setActivePreset('custom'); setPage(1); }} />
              </div>
              <span className="text-gray-300 pb-2.5">—</span>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block">{t('reports.toDate')}</label>
                <Input type="date" value={filters.dateTo} className="w-36"
                  onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setActivePreset('custom'); setPage(1); }} />
              </div>
            </div>

            {/* Preset pills */}
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              {([
                { key: 'today',  label: 'Hôm nay' },
                { key: 'month',  label: t('reports.currentMonth') },
                { key: 'last1',  label: t('reports.lastMonth') },
                { key: 'last2',  label: t('reports.lastTwoMonths') },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => applyPreset(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150 whitespace-nowrap
                    ${activePreset === key
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                  {label}
                </button>
              ))}

              {/* Inline month picker */}
              <div className="relative">
                <button onClick={() => setFilterMonthOpen(o => !o)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap
                    ${activePreset.startsWith('pick-')
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                  <Clock size={11} />
                  {activePreset.startsWith('pick-')
                    ? (() => { const [,y,m] = activePreset.split('-'); return `T${m}/${y}`; })()
                    : 'Chọn tháng'}
                  <ChevronDown size={10} />
                </button>

                {filterMonthOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setFilterMonthOpen(false)} />
                    <div className="absolute left-0 top-full mt-2 z-30 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-64">
                      {/* Year nav */}
                      <div className="flex items-center justify-between mb-3">
                        <button onClick={() => setFilterPickYear(y => y - 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
                          <ChevronLeft size={14} />
                        </button>
                        <span className="font-bold text-gray-800 text-sm">{filterPickYear}</span>
                        <button onClick={() => setFilterPickYear(y => y + 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
                          <ChevronRight size={14} />
                        </button>
                      </div>
                      {/* Month grid */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {MONTHS.map((label, i) => {
                          const m = i + 1;
                          const key = `pick-${filterPickYear}-${String(m).padStart(2,'0')}`;
                          const isSelected = activePreset === key;
                          return (
                            <button key={m} onClick={() => applyFilterMonth(filterPickYear, m)}
                              className={`py-2 rounded-xl text-xs font-medium transition-all
                                ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-indigo-50 hover:text-indigo-600 text-gray-700'}`}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto pb-0.5">
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                <RotateCcw size={13} /> {t('reports.reset')}
              </Button>
              {isAdmin && (
                <div className="relative">
                  <button onClick={() => setExportOpen(o => !o)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
                    <FileSpreadsheet size={13} /> {t('reports.exportExcel')} <ChevronDown size={12} />
                  </button>
                  {exportOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                        <button onClick={handleExport}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <List size={15} className="text-emerald-600 shrink-0" />
                          <div className="text-left">
                            <p className="font-medium">Báo cáo danh sách</p>
                            <p className="text-xs text-gray-400">Chi tiết từng bản ghi</p>
                          </div>
                        </button>
                        <div className="border-t border-gray-50" />
                        <button onClick={() => { setExportOpen(false); setGridModalOpen(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <LayoutGrid size={15} className="text-indigo-600 shrink-0" />
                          <div className="text-left">
                            <p className="font-medium">Bảng chấm công</p>
                            <p className="text-xs text-gray-400">Lưới S/C theo ngày</p>
                          </div>
                        </button>
                        <div className="border-t border-gray-50" />
                        <button onClick={() => { setExportOpen(false); setSummaryModalOpen(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <CalendarDays size={15} className="text-violet-600 shrink-0" />
                          <div className="text-left">
                            <p className="font-medium">Báo cáo ngày công</p>
                            <p className="text-xs text-gray-400">Tổng hợp ngày công tháng</p>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 2 — Search + Status, fills full width */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-50">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder={t('reports.searchName')} className="pl-8 text-sm w-full"
                value={search.employeeName}
                onChange={e => setSearch(s => ({ ...s, employeeName: e.target.value }))}
                onBlur={() => commitSearch('employeeName')}
                onKeyDown={e => e.key === 'Enter' && commitSearch('employeeName')} />
            </div>
            <div className="relative w-40 shrink-0">
              <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder={t('reports.searchCode')} className="pl-8 text-sm w-full"
                value={search.employeeCode}
                onChange={e => setSearch(s => ({ ...s, employeeCode: e.target.value }))}
                onBlur={() => commitSearch('employeeCode')}
                onKeyDown={e => e.key === 'Enter' && commitSearch('employeeCode')} />
            </div>
            <div className="w-px self-stretch bg-gray-100" />
            <div className="flex items-center gap-5 shrink-0">
              <label className="flex items-center gap-2 cursor-pointer select-none group whitespace-nowrap">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400"
                  checked={!!filters.isLate}
                  onChange={e => { setFilters(f => ({ ...f, isLate: e.target.checked || undefined })); setPage(1); }} />
                <span className="text-sm text-gray-600 group-hover:text-gray-900 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-red-400" /> {t('reports.lateFilter')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none group whitespace-nowrap">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                  checked={!!filters.isEarlyOut}
                  onChange={e => { setFilters(f => ({ ...f, isEarlyOut: e.target.checked || undefined })); setPage(1); }} />
                <span className="text-sm text-gray-600 group-hover:text-gray-900 flex items-center gap-1.5">
                  <LogOut size={12} className="text-amber-400" /> {t('reports.earlyFilter')}
                </span>
              </label>
            </div>
          </div>

        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t('reports.totalRecords')} value={String(total)}
            sub={`${filters.dateFrom} → ${filters.dateTo}`}
            gradient="bg-gradient-to-br from-indigo-500 to-indigo-700"
            icon={<ClipboardList size={18} className="text-white" />} />
          <StatCard label={t('reports.totalWorkingHours')} value={`${totalHours.toFixed(1)}h`}
            sub={total > 0 ? `TB ${(totalHours / total).toFixed(1)}h / bản ghi` : undefined}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            icon={<Clock size={18} className="text-white" />} />
          <StatCard label={t('attendance.late')} value={String(stats.late)}
            sub={data.length > 0 ? `${((stats.late / data.length) * 100).toFixed(0)}% trang hiện tại` : undefined}
            gradient="bg-gradient-to-br from-red-500 to-red-700"
            icon={<AlertTriangle size={18} className="text-white" />} />
          <StatCard label={t('attendance.earlyOut')} value={String(stats.earlyOut)}
            sub={data.length > 0 ? `${((stats.earlyOut / data.length) * 100).toFixed(0)}% trang hiện tại` : undefined}
            gradient="bg-gradient-to-br from-amber-500 to-amber-600"
            icon={<LogOut size={18} className="text-white" />} />
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={columns} data={data} loading={loading} keyExtractor={r => r.id} />

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{t('common.rowsPerPage')}:</span>
              <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                className="border border-gray-200 rounded-lg bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer">
                {[50, 100, 150, 200].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {total > 0 && (
                <span className="text-gray-400 ml-1">
                  {(page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = pageStart + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-gray-100 text-gray-600 border border-gray-200'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
