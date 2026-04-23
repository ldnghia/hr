'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { attendanceService } from '@/services/attendance.service';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, formatHours, formatDateFile } from '@/utils/format';
import type { AttendanceRecord, PaginatedResponse } from '@/types';

// ─── Status Badge Helper ──────────────────────────────────────────────────────

function AttendanceStatus({ record }: { record: AttendanceRecord }) {
  const { t } = useTranslation();
  const statusArr = [];
  if (record.isLate) statusArr.push({ label: t('attendance.late'), variant: 'danger' as const });
  if (record.isEarlyOut) statusArr.push({ label: t('attendance.earlyOut'), variant: 'warning' as const });
  if (record.isOvertime) statusArr.push({ label: `OT ${Number(record.overtimeHours).toFixed(1)}h`, variant: 'info' as const });

  if (statusArr.length === 0 && record.checkinTime) {
    return <Badge label={t('attendance.normal')} variant="success" />;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {statusArr.map((s, i) => <Badge key={i} label={s.label} variant={s.variant} />)}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AttendanceReportPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [summary, setSummary] = useState({ totalWorkingHours: 0 });

  // Default filter: 1st of current month → today
  const defaultDateFrom = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();
  const defaultDateTo = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // Filters
  const [filters, setFilters] = useState({
    dateFrom: defaultDateFrom,
    dateTo: defaultDateTo,
    employeeName: '',
    employeeCode: '',
    q: '',
    isLate: undefined as boolean | undefined,
    isEarlyOut: undefined as boolean | undefined,
  });

  // Local state for search inputs to prevent immediate reloading on every keystroke
  const [searchInput, setSearchInput] = useState({
    employeeName: '',
    employeeCode: '',
  });

  // Sync local search input when filters change (e.g. from Reset or Shortcuts)
  useEffect(() => {
    setSearchInput({
      employeeName: filters.employeeName,
      employeeCode: filters.employeeCode,
    });
  }, [filters.employeeName, filters.employeeCode]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attendanceService.report({
        page,
        limit,
        ...filters,
      });
      setData(res.data);
      setTotal(res.meta.total);
      setSummary({ totalWorkingHours: res.summary?.totalWorkingHours || 0 });
    } catch (err) {
      console.error('[report] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async () => {
    try {
      const res = await attendanceService.export(filters);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bao_Cao_Cham_Cong_${formatDateFile()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('[report] Export failed:', err);
      alert('Failed to export report');
    }
  };

  // ── Date Shortcuts ──────────────────────────────────────────────────────────

  const applyDateRange = (choice: number) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (choice === 0) {
      // Current month: 1st of current month to today
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
    } else if (choice === 1) {
      // Last month: 1st of prev month to last day of prev month
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (choice === 2) {
      // Last 2 months: 1st of 2 months ago to last day of prev month
      start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    const toYmd = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setFilters((f) => ({
      ...f,
      dateFrom: toYmd(start),
      dateTo: toYmd(end),
    }));
    setPage(1);
  };

  // ── Table Columns ──────────────────────────────────────────────────────────

  const columns: Column<AttendanceRecord>[] = [
    {
      key: 'employee',
      header: (
        <div className="space-y-2">
          <span>{t('reports.colEmployee')}</span>
          <Input
            className="h-8 text-xs font-normal"
            placeholder={t('reports.searchName')}
            value={searchInput.employeeName}
            onChange={e => setSearchInput({ ...searchInput, employeeName: e.target.value })}
            onBlur={() => {
              if (searchInput.employeeName !== filters.employeeName) {
                setFilters(f => ({ ...f, employeeName: searchInput.employeeName }));
                setPage(1);
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setFilters(f => ({ ...f, employeeName: searchInput.employeeName }));
                setPage(1);
              }
            }}
          />
          <Input
            className="h-8 text-xs font-normal"
            placeholder={t('reports.searchCode')}
            value={searchInput.employeeCode}
            onChange={e => setSearchInput({ ...searchInput, employeeCode: e.target.value })}
            onBlur={() => {
              if (searchInput.employeeCode !== filters.employeeCode) {
                setFilters(f => ({ ...f, employeeCode: searchInput.employeeCode }));
                setPage(1);
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setFilters(f => ({ ...f, employeeCode: searchInput.employeeCode }));
                setPage(1);
              }
            }}
          />
        </div>
      ),
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900">{r.employee?.fullName}</span>
          <span className="text-xs text-gray-400 font-mono uppercase tracking-tighter">[{r.employee?.code}]</span>
        </div>
      ),
    },
    {
      key: 'date',
      header: t('reports.colDay'),
      render: (r) => (
        <div className="font-medium text-gray-600">
          {formatDate(r.date)}
        </div>
      ),
    },
    {
      key: 'checkinTime',
      header: t('reports.colCheckin'),
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.checkinTime ? formatDateTime(r.checkinTime).split(' ')[1] : '--:--'}</span>
          {r.checkinNote && <span className="text-[10px] text-amber-600 line-clamp-1 italic">"{r.checkinNote}"</span>}
        </div>
      ),
    },
    {
      key: 'checkoutTime',
      header: t('reports.colCheckout'),
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.checkoutTime ? formatDateTime(r.checkoutTime).split(' ')[1] : '--:--'}</span>
          {r.checkoutNote && <span className="text-[10px] text-amber-600 line-clamp-1 italic">"{r.checkoutNote}"</span>}
        </div>
      ),
    },
    {
      key: 'workingHours',
      header: t('reports.colHours'),
      render: (r) => (
        <span className="font-mono font-bold text-indigo-600">
          {r.workingHours ? Number(r.workingHours).toFixed(2) : '0.00'}h
        </span>
      ),
    },
    {
      key: 'status',
      header: (
        <div className="space-y-2">
          <span>{t('reports.colStatus')}</span>
          <div className="flex gap-1">
             <label className="flex items-center gap-1 text-[10px] whitespace-nowrap cursor-pointer">
                <input type="checkbox" checked={!!filters.isLate} onChange={e => { setFilters(f => ({ ...f, isLate: e.target.checked ? true : undefined })); setPage(1); }} />
                {t('reports.lateFilter')}
             </label>
             <label className="flex items-center gap-1 text-[10px] whitespace-nowrap cursor-pointer">
                <input type="checkbox" checked={!!filters.isEarlyOut} onChange={e => { setFilters(f => ({ ...f, isEarlyOut: e.target.checked ? true : undefined })); setPage(1); }} />
                {t('reports.earlyFilter')}
             </label>
          </div>
        </div>
      ),
      render: (r) => <AttendanceStatus record={r} />,
    },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <AppShell title={t('reports.attendance')}>
      <div className="space-y-6">
        
        {/* ── Filter Bar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-gray-400">{t('reports.fromDate')}</label>
            <Input type="date" value={filters.dateFrom} onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPage(1); }} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-gray-400">{t('reports.toDate')}</label>
            <Input type="date" value={filters.dateTo} onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setPage(1); }} />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="text-[10px] h-7 px-2" onClick={() => applyDateRange(0)}>{t('reports.currentMonth')}</Button>
              <Button size="sm" variant="secondary" className="text-[10px] h-7 px-2" onClick={() => applyDateRange(1)}>{t('reports.lastMonth')}</Button>
              <Button size="sm" variant="secondary" className="text-[10px] h-7 px-2" onClick={() => applyDateRange(2)}>{t('reports.lastTwoMonths')}</Button>
            </div>
          </div>
          <div className="flex items-end justify-end gap-4">
            <Button variant="secondary" onClick={() => { setFilters({ dateFrom: defaultDateFrom, dateTo: defaultDateTo, employeeName: '', employeeCode: '', q: '', isLate: undefined, isEarlyOut: undefined }); setPage(1); }}>
              {t('reports.reset')}
            </Button>
            <Button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700">
               <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
               </svg>
               {t('reports.exportExcel')}
            </Button>
          </div>
        </div>

        {/* ── Summary ── */}
        <div className="flex items-center gap-8 bg-indigo-50 p-4 rounded-xl border border-indigo-100 overflow-hidden relative">
            <div className="absolute right-0 top-0 h-full w-32 bg-indigo-100/50 skew-x-[-20deg] translate-x-12" />
            <div>
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{t('reports.totalWorkingHours')}</p>
              <p className="text-2xl font-black text-indigo-700">{summary.totalWorkingHours.toFixed(2)}h</p>
            </div>
            <div className="h-10 w-px bg-indigo-200" />
            <div>
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{t('reports.totalRecords')}</p>
              <p className="text-2xl font-black text-indigo-700">{total}</p>
            </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <Table 
            columns={columns} 
            data={data} 
            loading={loading} 
            keyExtractor={r => r.id}
          />
          
          {/* ── Pagination ── */}
          <div className="px-6 py-4 border-t border-gray-50 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{t('common.rowsPerPage')}:</span>
              <select 
                title="Rows per page"
                aria-label="Rows per page"
                value={limit} 
                onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                className="text-sm border-gray-200 rounded-md bg-gray-50 p-1 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={150}>150</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
               <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('reports.prev')}</Button>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-lg text-sm font-medium">
                    <span className="text-indigo-600">{page}</span>
                    <span className="text-gray-400">/</span>
                    <span className="text-gray-500">{totalPages || 1}</span>
                  </div>
                  <Button size="sm" variant="secondary" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)}>{t('reports.next')}</Button>
               </div>
               
               <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{t('reports.goTo')}</span>
                  <input 
                    type="number" 
                    title="Go to page"
                    aria-label="Go to page"
                    placeholder="Page"
                    min={1} 
                    max={totalPages} 
                    className="w-16 h-8 border border-gray-200 rounded-md text-center text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = parseInt((e.target as HTMLInputElement).value);
                        if (val >= 1 && val <= totalPages) setPage(val);
                      }
                    }}
                  />
               </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
