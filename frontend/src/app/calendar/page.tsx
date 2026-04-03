'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { calendarService } from '@/services/calendar.service';
import { authService } from '@/services/auth.service';
import { formatDate } from '@/utils/format';
import type {
  CalendarDay,
  CalendarSummary,
  Holiday,
  DayType,
} from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DAY_TYPE_STYLES: Record<DayType, string> = {
  WORKING:      'bg-white text-gray-800 hover:bg-gray-50',
  WEEKEND:      'bg-gray-100 text-gray-500',
  HOLIDAY:      'bg-rose-100 text-rose-700 font-medium',
  COMPENSATION: 'bg-indigo-100 text-indigo-700 font-medium',
};

const DAY_TYPE_LABEL: Record<DayType, string> = {
  WORKING:      'Working',
  WEEKEND:      'Weekend',
  HOLIDAY:      'Holiday',
  COMPENSATION: 'Compensation',
};

const ADMIN_ROLES = new Set(['admin', 'hr']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { status?: number; data?: { message?: string | string[] } }; message?: string };
  const status = e?.response?.status;
  if (status === 403) return 'Insufficient permissions.';
  const raw = e?.response?.data?.message;
  if (raw) return Array.isArray(raw) ? raw[0] : raw;
  return e?.message ?? fallback;
}

/** Build a map from "YYYY-MM-DD" to CalendarDay for fast lookup */
function buildDayMap(days: CalendarDay[]): Map<string, CalendarDay> {
  const m = new Map<string, CalendarDay>();
  for (const d of days) m.set(d.date.slice(0, 10), d);
  return m;
}

/** All calendar-date strings for a given year+month (1-indexed) */
function daysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month, 0).getDate(); // month is 1-indexed, so new Date(y, m, 0) = last day
  const result: string[] = [];
  for (let d = 1; d <= count; d++) {
    result.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return result;
}

/** Which weekday (0=Sun) does the 1st of month fall on */
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LegendDot({ type }: { type: DayType }) {
  const bg = {
    WORKING:      'bg-white border border-gray-300',
    WEEKEND:      'bg-gray-200',
    HOLIDAY:      'bg-rose-400',
    COMPENSATION: 'bg-indigo-400',
  }[type];
  return <span className={`inline-block h-3 w-3 rounded-sm ${bg}`} />;
}

function SummaryBar({ summary }: { summary: CalendarSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(['WORKING', 'WEEKEND', 'HOLIDAY', 'COMPENSATION'] as DayType[]).map((type) => (
        <div key={type} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <div className="text-2xl font-bold text-gray-800">{summary[type]}</div>
          <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-gray-500">
            <LegendDot type={type} />
            {DAY_TYPE_LABEL[type]}
          </div>
        </div>
      ))}
    </div>
  );
}

interface MonthGridProps {
  year: number;
  month: number;   // 1-indexed
  dayMap: Map<string, CalendarDay>;
  today: string;
}

function MonthGrid({ year, month, dayMap, today }: MonthGridProps) {
  const dates = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  const cells: (string | null)[] = [...Array(firstDay).fill(null), ...dates];
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400 mb-1">
        {DAY_LABELS.map((l) => <div key={l}>{l}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
        {cells.map((dateStr, i) => {
          if (!dateStr) {
            return <div key={`empty-${i}`} className="bg-gray-50 h-10" />;
          }
          const day = dayMap.get(dateStr);
          const type: DayType = day?.type ?? 'WORKING';
          const isToday = dateStr === today;
          const dayNum = parseInt(dateStr.slice(8), 10);

          return (
            <div
              key={dateStr}
              title={day ? `${DAY_TYPE_LABEL[type]}${day.note ? ` — ${day.note}` : ''}` : undefined}
              className={[
                'flex items-center justify-center h-10 text-sm transition-colors',
                DAY_TYPE_STYLES[type],
                isToday ? 'ring-2 ring-inset ring-indigo-500' : '',
              ].join(' ')}
            >
              <span className={isToday ? 'font-bold underline' : ''}>{dayNum}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Holiday form state ───────────────────────────────────────────────────────

interface HolidayForm {
  name: string;
  fromDate: string;
  toDate: string;
  isPaid: boolean;
  isRecurring: boolean;
  description: string;
}

const EMPTY_HOLIDAY_FORM: HolidayForm = {
  name: '',
  fromDate: '',
  toDate: '',
  isPaid: true,
  isRecurring: false,
  description: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const user = authService.getCurrentUser();
  const isAdmin = ADMIN_ROLES.has(user?.role ?? '');

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ── State ──────────────────────────────────────────────────────────────────
  const [year, setYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);

  const [loadingDays, setLoadingDays] = useState(true);
  const [loadingHolidays, setLoadingHolidays] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [dayMap, setDayMap] = useState<Map<string, CalendarDay>>(new Map());
  const [summary, setSummary] = useState<CalendarSummary | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const [pageError, setPageError] = useState('');
  const [generateMsg, setGenerateMsg] = useState('');

  // Holiday modal
  const [holidayModal, setHolidayModal] = useState<'create' | 'edit' | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayForm, setHolidayForm] = useState<HolidayForm>(EMPTY_HOLIDAY_FORM);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayError, setHolidayError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadDays = useCallback(async () => {
    setLoadingDays(true);
    setPageError('');
    try {
      const [days, sum] = await Promise.all([
        calendarService.getDays(year),
        calendarService.getSummary(year),
      ]);
      setDayMap(buildDayMap(days));
      setSummary(sum);
    } catch (err) {
      setPageError(extractError(err, 'Failed to load calendar days.'));
    } finally {
      setLoadingDays(false);
    }
  }, [year]);

  const loadHolidays = useCallback(async () => {
    setLoadingHolidays(true);
    try {
      const h = await calendarService.getHolidays(year);
      setHolidays(h);
    } catch (err) {
      console.error('[calendar] holidays error', err);
    } finally {
      setLoadingHolidays(false);
    }
  }, [year]);

  useEffect(() => {
    loadDays();
    loadHolidays();
  }, [loadDays, loadHolidays]);

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    setGenerateMsg('');
    setPageError('');
    try {
      const res = await calendarService.generate(year);
      setGenerateMsg(`Generated ${res.generated} days (${res.skipped} skipped).`);
      await loadDays();
    } catch (err) {
      setPageError(extractError(err, 'Generation failed.'));
    } finally {
      setGenerating(false);
    }
  }

  // ── Month navigation ───────────────────────────────────────────────────────

  function prevMonth() {
    if (viewMonth === 1) { setYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { setYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  }

  // ── Holiday CRUD ───────────────────────────────────────────────────────────

  function openCreate() {
    setHolidayForm(EMPTY_HOLIDAY_FORM);
    setHolidayError('');
    setEditingHoliday(null);
    setHolidayModal('create');
  }

  function openEdit(h: Holiday) {
    setHolidayForm({
      name: h.name,
      fromDate: h.fromDate.slice(0, 10),
      toDate: h.toDate.slice(0, 10),
      isPaid: h.isPaid,
      isRecurring: h.isRecurring,
      description: h.description ?? '',
    });
    setHolidayError('');
    setEditingHoliday(h);
    setHolidayModal('edit');
  }

  function closeHolidayModal() {
    setHolidayModal(null);
    setEditingHoliday(null);
    setHolidayError('');
  }

  async function saveHoliday() {
    if (!holidayForm.name.trim()) { setHolidayError('Name is required.'); return; }
    if (!holidayForm.fromDate) { setHolidayError('From date is required.'); return; }
    if (!holidayForm.toDate) { setHolidayError('To date is required.'); return; }
    if (holidayForm.toDate < holidayForm.fromDate) { setHolidayError('To date must be on or after From date.'); return; }

    setHolidaySaving(true);
    setHolidayError('');
    try {
      const payload = {
        name: holidayForm.name.trim(),
        fromDate: holidayForm.fromDate,
        toDate: holidayForm.toDate,
        isPaid: holidayForm.isPaid,
        isRecurring: holidayForm.isRecurring,
        description: holidayForm.description.trim() || undefined,
      };
      if (holidayModal === 'edit' && editingHoliday) {
        await calendarService.updateHoliday(editingHoliday.id, payload);
      } else {
        await calendarService.createHoliday(payload);
      }
      closeHolidayModal();
      await loadHolidays();
    } catch (err) {
      setHolidayError(extractError(err, 'Failed to save holiday.'));
    } finally {
      setHolidaySaving(false);
    }
  }

  async function deleteHoliday(id: number) {
    setDeletingId(id);
    try {
      await calendarService.deleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      setPageError(extractError(err, 'Failed to delete holiday.'));
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell title="Calendar">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Work Calendar</h1>
            <p className="text-sm text-gray-500">Public holidays, weekends, and compensation days</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                loading={generating}
                onClick={handleGenerate}
              >
                Generate {year}
              </Button>
            </div>
          )}
        </div>

        {pageError && <Alert variant="error" message={pageError} />}
        {generateMsg && <Alert variant="success" message={generateMsg} />}

        {/* ── Summary bar ── */}
        {loadingDays ? (
          <PageSpinner />
        ) : summary ? (
          <SummaryBar summary={summary} />
        ) : null}

        {/* ── Month calendar ── */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          {/* Month nav */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Previous month"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-base font-semibold text-gray-800">
              {MONTH_NAMES[viewMonth - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Next month"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {loadingDays ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : (
            <MonthGrid year={year} month={viewMonth} dayMap={dayMap} today={todayStr} />
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
            {(['WORKING', 'WEEKEND', 'HOLIDAY', 'COMPENSATION'] as DayType[]).map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <LegendDot type={type} />
                {DAY_TYPE_LABEL[type]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-indigo-500" />
              Today
            </span>
          </div>
        </div>

        {/* ── Holidays section ── */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">
              Public Holidays {year}
            </h2>
            {isAdmin && (
              <Button size="sm" onClick={openCreate}>
                + Add Holiday
              </Button>
            )}
          </div>

          {loadingHolidays ? (
            <div className="flex h-20 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : holidays.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No holidays configured for {year}.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-start justify-between py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-800">{h.name}</span>
                      {h.isPaid && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Paid</span>
                      )}
                      {h.isRecurring && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Recurring</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-gray-500">
                      {formatDate(h.fromDate)}
                      {h.fromDate.slice(0, 10) !== h.toDate.slice(0, 10) && (
                        <> &ndash; {formatDate(h.toDate)}</>
                      )}
                    </div>
                    {h.description && (
                      <div className="mt-0.5 text-xs text-gray-400">{h.description}</div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="ml-4 flex shrink-0 gap-2">
                      <button
                        onClick={() => openEdit(h)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteHoliday(h.id)}
                        disabled={deletingId === h.id}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
                      >
                        {deletingId === h.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Holiday modal ── */}
      <Modal
        open={holidayModal !== null}
        onClose={closeHolidayModal}
        title={holidayModal === 'edit' ? 'Edit Holiday' : 'Add Holiday'}
        size="md"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeHolidayModal}>
              Cancel
            </Button>
            <Button size="sm" loading={holidaySaving} onClick={saveHoliday}>
              {holidayModal === 'edit' ? 'Save Changes' : 'Create Holiday'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {holidayError && <Alert variant="error" message={holidayError} />}

          <Input
            label="Name"
            placeholder="e.g. National Day"
            value={holidayForm.name}
            onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="From Date"
              type="date"
              value={holidayForm.fromDate}
              onChange={(e) => setHolidayForm((f) => ({ ...f, fromDate: e.target.value }))}
            />
            <Input
              label="To Date"
              type="date"
              value={holidayForm.toDate}
              min={holidayForm.fromDate}
              onChange={(e) => setHolidayForm((f) => ({ ...f, toDate: e.target.value }))}
            />
          </div>

          <Input
            label="Description (optional)"
            placeholder="Brief note"
            value={holidayForm.description}
            onChange={(e) => setHolidayForm((f) => ({ ...f, description: e.target.value }))}
          />

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={holidayForm.isPaid}
                onChange={(e) => setHolidayForm((f) => ({ ...f, isPaid: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Paid holiday
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={holidayForm.isRecurring}
                onChange={(e) => setHolidayForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Recurring every year
            </label>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
