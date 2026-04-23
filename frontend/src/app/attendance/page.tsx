'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { usePagination } from '@/hooks/usePagination';
import { attendanceService } from '@/services/attendance.service';
import { employeeService } from '@/services/employee.service';
import { organizationService } from '@/services/organization.service';
import type { NearestBranch } from '@/services/attendance.service';
import { formatDate, formatDateTime, formatHours } from '@/utils/format';
import type {
  TodayStatus,
  AttendanceRecord,
  OfficeLocation,
  PaginatedResponse,
  Branch,
} from '@/types';

// ─── Haversine (client-side preview distance) ─────────────────────────────────

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

// ─── WFM status badges ─────────────────────────────────────────────────────────

function WfmBadges({ record }: { record: AttendanceRecord }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1">
      {record.isLate && <Badge label={t('attendance.late')} variant="danger" />}
      {record.isEarlyOut && <Badge label={t('attendance.earlyOut')} variant="warning" />}
      {record.isOvertime && (
        <Badge label={`OT ${Number(record.overtimeHours).toFixed(1)}h`} variant="info" />
      )}
      {!record.isLate && !record.isEarlyOut && !record.isOvertime && record.checkinTime && (
        <Badge label={t('attendance.onTime')} variant="success" />
      )}
    </div>
  );
}

// ─── Retry icon ───────────────────────────────────────────────────────────────

function RetryIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

// ─── GPS Check-in Panel ───────────────────────────────────────────────────────

type OfficeStatus = 'IN_OFFICE' | 'OUTSIDE';

interface OfficeResult {
  name: string;
  distanceM: number;
  status: OfficeStatus;
  confirmed: boolean; // true = from backend, false = client-side preview
}

interface GpsCheckInProps {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
  employeeOffice: OfficeLocation | null;
  confirmedOffice: { status: OfficeStatus; distanceM: number } | null;
  locationSource: 'GPS' | 'NO_LOCATION' | null;
  branches: Branch[];
  confirmedBranch: NearestBranch | null;
}

function GpsCheckIn({
  lat,
  lng,
  accuracy,
  error,
  loading,
  retry,
  employeeOffice,
  confirmedOffice,
  locationSource,
  branches,
  confirmedBranch,
}: GpsCheckInProps) {
  const { t } = useTranslation();

  // ── Nearest branch: always compute, regardless of whether employee has an assigned office.
  // Priority: backend-confirmed result (after check-in) > client-side haversine preview.
  type BranchResult = { name: string; distanceM: number; isInOffice: boolean; confirmed: boolean };
  let nearestBranchResult: BranchResult | null = null;

  if (confirmedBranch) {
    nearestBranchResult = { ...confirmedBranch, confirmed: true };
  } else if (lat != null && lng != null && branches.length > 0) {
    let best: BranchResult | null = null;
    for (const b of branches) {
      if (b.latitude == null || b.longitude == null) continue;
      const dist = Math.round(haversineMetres(lat, lng, b.latitude, b.longitude));
      if (!best || dist < best.distanceM) {
        best = {
          name: b.name,
          distanceM: dist,
          isInOffice: dist <= (b.radius ?? 50),
          confirmed: false,
        };
      }
    }
    nearestBranchResult = best;
  }

  // ── Assigned office card (client-side preview or backend-confirmed) ─────────
  let officeResult: OfficeResult | null = null;

  if (confirmedOffice && employeeOffice) {
    officeResult = {
      name: employeeOffice.name,
      distanceM: confirmedOffice.distanceM,
      status: confirmedOffice.status,
      confirmed: true,
    };
  } else if (lat != null && lng != null && employeeOffice) {
    const dist = haversineMetres(lat, lng, employeeOffice.latitude, employeeOffice.longitude);
    officeResult = {
      name: employeeOffice.name,
      distanceM: Math.round(dist),
      status: dist <= employeeOffice.radius ? 'IN_OFFICE' : 'OUTSIDE',
      confirmed: false,
    };
  }

  // Employee is authorized if:
  //  - within assigned office, OR
  //  - within any branch geofence (even if outside assigned office)
  const isInOffice = officeResult?.status === 'IN_OFFICE' || (nearestBranchResult?.isInOffice ?? false);

  // Show the branch panel when:
  //  - employee has no assigned office (original behaviour), OR
  //  - employee is in a branch but OUTSIDE their assigned office (explains why check-in succeeded)
  const showBranchPanel =
    (!employeeOffice && !confirmedOffice) ||
    (nearestBranchResult?.isInOffice === true && officeResult?.status === 'OUTSIDE');

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t('attendance.gpsLocation')}
        </p>
        <button
          onClick={retry}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-40 transition-colors"
          aria-label="Retry GPS"
        >
          <RetryIcon spinning={loading} />
          {t('common.retry')}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
          <Spinner className="h-4 w-4 shrink-0 text-indigo-500" />
          <span>{t('attendance.acquiringGps')}</span>
        </div>
      )}

      {/* Error state — multi-line for permission instructions */}
      {!loading && error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-800">{t('attendance.locationUnavailable')}</p>
              <p className="mt-1 text-xs text-amber-700 whitespace-pre-line leading-relaxed">{error}</p>
            </div>
          </div>
          <button
            onClick={retry}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-200 transition-colors min-h-[44px]"
          >
            <RetryIcon />
            {t('attendance.tryAgain')}
          </button>
        </div>
      )}

      {/* Coordinates */}
      {!loading && !error && lat != null && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-gray-100 bg-white px-2 py-2 text-center">
            <p className="text-gray-400 mb-0.5">{t('attendance.latitude')}</p>
            <p className="font-mono font-medium text-gray-800">{lat.toFixed(6)}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white px-2 py-2 text-center">
            <p className="text-gray-400 mb-0.5">{t('attendance.longitude')}</p>
            <p className="font-mono font-medium text-gray-800">{lng?.toFixed(6)}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white px-2 py-2 text-center">
            <p className="text-gray-400 mb-0.5">{t('attendance.accuracy')}</p>
            <p className="font-medium text-gray-800">±{accuracy}m</p>
          </div>
        </div>
      )}

      {/* Office status card */}
      {officeResult && (
        <div className={`rounded-lg border px-3 py-3 transition-colors ${
          isInOffice
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Status dot */}
              <span className={`relative flex h-2.5 w-2.5 shrink-0`}>
                {isInOffice && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isInOffice ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </span>
              <span className={`text-sm font-semibold truncate ${isInOffice ? 'text-emerald-700' : 'text-red-700'}`}>
                {officeResult.name}
              </span>
            </div>
            {/* Status pill */}
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${
              isInOffice
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {isInOffice ? (
                <>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {t('attendance.inOfficePill')}
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {t('attendance.outsidePill')}
                </>
              )}
            </span>
          </div>
          <p className={`mt-1.5 text-xs ${isInOffice ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmtDistance(officeResult.distanceM)} {t('attendance.fromOffice')}
            {officeResult.confirmed && (
              <span className="ml-1.5 text-gray-400">{t('attendance.verifiedAtCheckin')}</span>
            )}
          </p>
        </div>
      )}

      {/* Nearest branch — shown when no assigned office, or when in a branch but outside assigned office */}
      {!loading && !error && lat != null && showBranchPanel && (
        nearestBranchResult ? (
          <div className={`rounded-lg border px-3 py-3 transition-colors ${
            nearestBranchResult.isInOffice
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}>
            {/* Header row: name + status pill */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {nearestBranchResult.isInOffice && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    nearestBranchResult.isInOffice ? 'bg-emerald-500' : 'bg-red-500'
                  }`} />
                </span>
                <span className={`text-sm font-semibold truncate ${
                  nearestBranchResult.isInOffice ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {nearestBranchResult.name}
                </span>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${
                nearestBranchResult.isInOffice
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {nearestBranchResult.isInOffice ? (
                  <>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {t('attendance.inOfficePill')}
                  </>
                ) : (
                  <>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {t('attendance.outsidePill')}
                  </>
                )}
              </span>
            </div>

            {/* Distance subtitle */}
            <p className={`mt-1.5 text-xs ${
              nearestBranchResult.isInOffice ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {nearestBranchResult.isInOffice
                ? `${t('attendance.nearestBranch')}: ${nearestBranchResult.name} · ${fmtDistance(nearestBranchResult.distanceM)}`
                : `${t('attendance.outsideOfficeDist')} · ${fmtDistance(nearestBranchResult.distanceM)} ${t('attendance.away')}`
              }
              {nearestBranchResult.confirmed && (
                <span className="ml-1.5 text-gray-400">{t('attendance.verifiedAtCheckin')}</span>
              )}
            </p>
          </div>
        ) : (
          // GPS acquired but no branches have GPS coordinates configured
          <p className="text-xs text-gray-400 text-center py-1">
            {t('attendance.gpsNoBranches')}
          </p>
        )
      )}

      {/* NO_LOCATION badge — shown after manual check-in without GPS */}
      {locationSource === 'NO_LOCATION' && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-500">
          <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t('attendance.noLocationBadge')}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const geo = useGeolocation();

  // HTTPS detection (geolocation requires secure context on mobile)
  const [isHttps, setIsHttps] = useState(true);
  useEffect(() => {
    setIsHttps(window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  }, []);

  // Today's status
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Employee's assigned office (for GPS preview)
  const [employeeOffice, setEmployeeOffice] = useState<OfficeLocation | null>(null);

  // Backend-confirmed office status from last check-in response
  const [confirmedOffice, setConfirmedOffice] = useState<{ status: 'IN_OFFICE' | 'OUTSIDE'; distanceM: number } | null>(null);
  const [locationSource, setLocationSource] = useState<'GPS' | 'NO_LOCATION' | null>(null);

  // Fallback reason when GPS is unavailable
  const [locationNote, setLocationNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [forceReason, setForceReason] = useState(false);
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Branch list (for live GPS preview) + confirmed result from last check-in
  const [branches, setBranches] = useState<Branch[]>([]);
  const [confirmedBranch, setConfirmedBranch] = useState<NearestBranch | null>(null);

  // My history (paginated)
  const [myRecords, setMyRecords] = useState<PaginatedResponse<AttendanceRecord> | null>(null);
  const [myLoading, setMyLoading] = useState(true);
  const { page: myPage, limit: myLimit, next: myNext, prev: myPrev } = usePagination(10);

  // Admin report
  const isManager = user && ['admin', 'hr', 'manager'].includes(user.role);
  const [report, setReport] = useState<(PaginatedResponse<AttendanceRecord> & { summary?: { totalWorkingHours: number; totalRecords: number } }) | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeFilter, setActiveFilter] = useState({ dateFrom: '', dateTo: '' });
  const { page, limit, next, prev, reset } = usePagination(20);

  // ── Load today status + employee profile + branch list ────────────────────
  useEffect(() => {
    if (!user) return;
    Promise.allSettled([
      attendanceService.today(),
      employeeService.get(user.id),
      organizationService.branches(),
    ]).then(([todayRes, profileRes, branchesRes]) => {
      if (todayRes.status === 'fulfilled') setTodayStatus(todayRes.value);
      if (profileRes.status === 'fulfilled' && profileRes.value.office) {
        setEmployeeOffice(profileRes.value.office);
      }
      if (branchesRes.status === 'fulfilled') setBranches(branchesRes.value);
      setTodayLoading(false);
    });
  }, [user]);

  // ─── Calculate distance/status ───
  let inAssignedOffice = false;
  if (geo.lat != null && geo.lng != null && employeeOffice) {
    const dist = haversineMetres(geo.lat, geo.lng, employeeOffice.latitude, employeeOffice.longitude);
    inAssignedOffice = dist <= employeeOffice.radius;
  }

  let inAnyBranch = false;
  if (geo.lat != null && geo.lng != null) {
    inAnyBranch = branches.some(b => {
      if (b.latitude == null || b.longitude == null) return false;
      const dist = haversineMetres(geo.lat!, geo.lng!, b.latitude, b.longitude);
      return dist <= (b.radius ?? 50);
    });
  }

  // User is 'outside' if GPS is logic but they are neither in their assigned office nor any other geofence
  const isOutside = (geo.lat != null && geo.lng != null) && !inAssignedOffice && !inAnyBranch;

  // Textarea requested whenever GPS failed OR user is outside the authorized geofences
  const needsReason = geo.status !== 'success' || isOutside || forceReason;

  // Auto-focus the textarea only once GPS has definitively failed (not while still acquiring)
  const gpsDefinitelyFailed =
    geo.status === 'denied' ||
    geo.status === 'unavailable' ||
    geo.status === 'timeout' ||
    geo.status === 'unsupported';

  useEffect(() => {
    if (gpsDefinitelyFailed && !todayStatus?.checkedIn) {
      noteRef.current?.focus();
    }
  }, [gpsDefinitelyFailed, todayStatus?.checkedIn]);

  // Clear reason when GPS recovers after a retry
  useEffect(() => {
    if (geo.status === 'success') {
      setLocationNote('');
      setNoteError('');
      setForceReason(false);
    }
  }, [geo.status]);

  // ── Load my records ────────────────────────────────────────────────────────
  const loadMyRecords = useCallback(async () => {
    setMyLoading(true);
    try {
      const data = await attendanceService.me({ page: myPage, limit: myLimit });
      setMyRecords(data);
    } catch (err) {
      console.error('[attendance] Failed to load my records:', err);
    } finally {
      setMyLoading(false);
    }
  }, [myPage, myLimit]);

  useEffect(() => { loadMyRecords(); }, [loadMyRecords]);

  // ── Load admin report ──────────────────────────────────────────────────────
  const loadReport = useCallback(async () => {
    if (!isManager) return;
    setReportLoading(true);
    try {
      const data = await attendanceService.report({
        page,
        limit,
        dateFrom: activeFilter.dateFrom || undefined,
        dateTo: activeFilter.dateTo || undefined,
      });
      setReport(data);
    } catch (err) {
      console.error('[attendance] Failed to load report:', err);
    } finally {
      setReportLoading(false);
    }
  }, [page, limit, activeFilter.dateFrom, activeFilter.dateTo, isManager]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // ── Check-in ───────────────────────────────────────────────────────────────
  async function handleCheckIn() {
    setActionMsg(null);

    // When GPS is not confirmed a reason is mandatory — validate client-side first
    if (needsReason && !locationNote.trim()) {
      setNoteError(t('attendance.pleaseEnterReason'));
      noteRef.current?.focus();
      return;
    }
    setNoteError('');
    setActionLoading(true);
    try {
      const result = await attendanceService.checkIn({
        lat: geo.lat ?? undefined,
        lng: geo.lng ?? undefined,
        locationNote: needsReason ? locationNote.trim() : undefined,
      });

      // Store backend-confirmed statuses for GPS panel
      if (result.office) setConfirmedOffice(result.office);
      if (result.nearestBranch) setConfirmedBranch(result.nearestBranch);
      setLocationSource(result.locationSource ?? null);

      setLocationNote('');
      const successMsg = result.isLate
        ? `Checked in at ${formatDateTime(result.attendance.checkinTime)} — marked LATE`
        : `Checked in at ${formatDateTime(result.attendance.checkinTime)} — on time`;
      setActionMsg({ type: result.isLate ? 'error' : 'success', text: successMsg });

      // Clear any stale "force reason" state — check-in succeeded so location is authorized.
      setForceReason(false);
      setNoteError('');

      const fresh = await attendanceService.today();
      setTodayStatus(fresh);
      loadMyRecords();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Check-in failed. Please try again.';
      console.error('[attendance] Check-in failed:', msg);
      if (msg.toLowerCase().includes('reason')) {
        setForceReason(true);
        setNoteError(msg);
      } else {
        setActionMsg({ type: 'error', text: msg });
      }
    } finally {
      setActionLoading(false);
    }
  }

  // ── Check-out ──────────────────────────────────────────────────────────────
  async function handleCheckOut() {
    setActionMsg(null);

    if (needsReason && !locationNote.trim()) {
      setNoteError(t('attendance.pleaseEnterReason'));
      noteRef.current?.focus();
      return;
    }
    setNoteError('');

    setActionLoading(true);
    try {
      const result = await attendanceService.checkOut({
        lat: geo.lat ?? undefined,
        lng: geo.lng ?? undefined,
        locationNote: needsReason ? locationNote.trim() : undefined,
      });

      setLocationNote('');

      let successMsg = `Checked out · ${Number(result.workingHours).toFixed(1)}h worked`;
      if (result.isOvertime) successMsg += ` · OT ${Number(result.overtimeHours).toFixed(1)}h`;
      if (result.isEarlyOut) successMsg += ' · Early out';
      setActionMsg({ type: 'success', text: successMsg });
      setForceReason(false);
      setNoteError('');

      const fresh = await attendanceService.today();
      setTodayStatus(fresh);
      loadMyRecords();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Check-out failed. Please try again.';
      console.error('[attendance] Check-out failed:', msg);
      if (msg.toLowerCase().includes('reason')) {
        setForceReason(true);
        setNoteError(msg);
      } else {
        setActionMsg({ type: 'error', text: msg });
      }
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const checkedIn = todayStatus?.checkedIn ?? false;
  const checkedOut = todayStatus?.checkedOut ?? false;
  const todayRecord = todayStatus?.attendance;

  return (
    <AppShell title={t('attendance.title')}>
      <div className="space-y-6">

        {/* ── HTTPS warning ── */}
        {!isHttps && (
          <div className="flex items-start gap-3 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p>
              <span className="font-semibold">{t('attendance.httpsWarning')}</span>{' '}
              {t('attendance.httpsWarningDesc')}
            </p>
          </div>
        )}

        {/* ── My Attendance Panel ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-base font-semibold text-gray-800">{t('attendance.myAttendanceToday')}</h3>
          </div>

          {/* Grid is always rendered so the GPS panel and action buttons are
              immediately visible. Only the today-stats sub-section waits for
              the API — everything else derives from GPS state (instant). */}
          <div className="p-6 grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Left: status + action */}
            <div className="space-y-4">

              {/* Today stats — gated on todayLoading only here */}
              {todayLoading ? (
                <div className="grid grid-cols-2 gap-3 text-sm animate-pulse">
                  {[t('attendance.checkinLabel'), t('attendance.checkoutLabel'), t('attendance.workingHoursLabel'), t('attendance.shiftLabel')].map((lbl) => (
                    <div key={lbl} className="rounded-lg bg-gray-50 px-4 py-3">
                      <p className="text-xs text-gray-400 mb-1">{lbl}</p>
                      <div className="h-4 w-20 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <p className="text-xs text-gray-400 mb-1">{t('attendance.checkinLabel')}</p>
                      <p className="font-medium text-gray-800">
                        {todayRecord?.checkinTime ? formatDateTime(todayRecord.checkinTime) : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <p className="text-xs text-gray-400 mb-1">{t('attendance.checkoutLabel')}</p>
                      <p className="font-medium text-gray-800">
                        {todayRecord?.checkoutTime ? formatDateTime(todayRecord.checkoutTime) : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <p className="text-xs text-gray-400 mb-1">{t('attendance.workingHoursLabel')}</p>
                      <p className="font-medium text-gray-800">
                        {todayRecord?.workingHours ? formatHours(todayRecord.workingHours) : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <p className="text-xs text-gray-400 mb-1">{t('attendance.shiftLabel')}</p>
                      <p className="font-medium text-gray-800 truncate">
                        {todayRecord?.shift
                          ? `${todayRecord.shift.name} (${todayRecord.shift.startTime}–${todayRecord.shift.endTime})`
                          : '—'}
                      </p>
                    </div>
                  </div>
                  {todayRecord && <WfmBadges record={todayRecord} />}
                </>
              )}

              {/* Action feedback — always visible */}
              {actionMsg && (
                <Alert
                  variant={actionMsg.type === 'success' ? 'success' : 'error'}
                  message={actionMsg.text}
                />
              )}

                {/* Check-in / Check-out button */}
                {!checkedIn ? (
                  <div className="space-y-3">
                    {/* Location reason — shown whenever GPS is not confirmed (acquiring OR failed) */}
                    {needsReason && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                        {/* Warning header */}
                        <div className="flex items-start gap-2">
                          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          <p className="text-sm font-medium text-amber-800">
                            {isOutside
                              ? t('attendance.outsideLocation')
                              : geo.status === 'acquiring'
                                ? t('attendance.acquiringPosition')
                                : t('attendance.locationNotAvailable')}
                          </p>
                        </div>

                        {/* Reason textarea */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-amber-800">
                            {isOutside ? t('attendance.reasonForCheckinOutside') : t('attendance.reasonForCheckinNoGps')}
                          </label>
                          <textarea
                            ref={noteRef}
                            value={locationNote}
                            onChange={(e) => { setLocationNote(e.target.value); setNoteError(''); }}
                            placeholder={isOutside ? t('attendance.checkInPlaceholderOutside') : t('attendance.checkInPlaceholderGps')}
                            rows={2}
                            className="w-full resize-none rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>

                        {noteError && (
                          <p className="text-xs font-medium text-red-600">{noteError}</p>
                        )}
                      </div>
                    )}

                    <Button
                      className="w-full min-h-[60px] text-lg font-semibold tracking-wide rounded-2xl shadow-sm active:scale-95 transition-transform"
                      size="lg"
                      loading={actionLoading}
                      disabled={needsReason && !locationNote.trim()}
                      onClick={handleCheckIn}
                    >
                      <svg className="mr-2 h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      {t('attendance.checkIn')}
                    </Button>
                  </div>
                ) : !checkedOut ? (
                  <div className="space-y-3">
                    {/* Location reason for Check Out */}
                    {needsReason && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          <p className="text-sm font-medium text-amber-800">
                            {isOutside
                              ? t('attendance.outsideLocation')
                              : t('attendance.locationNotAvailable')}
                          </p>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-amber-800">
                            {t('attendance.reasonForCheckout')}
                          </label>
                          <textarea
                            ref={noteRef}
                            value={locationNote}
                            onChange={(e) => { setLocationNote(e.target.value); setNoteError(''); }}
                            placeholder={t('attendance.checkoutPlaceholder')}
                            rows={2}
                            className="w-full resize-none rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                        {noteError && <p className="text-xs font-medium text-red-600">{noteError}</p>}
                      </div>
                    )}

                    <Button
                      className="w-full min-h-[60px] text-lg font-semibold tracking-wide rounded-2xl shadow-sm active:scale-95 transition-transform"
                      size="lg"
                      variant="secondary"
                      loading={actionLoading}
                      disabled={needsReason && !locationNote.trim()}
                      onClick={() => setShowCheckoutConfirm(true)}
                    >
                      <svg className="mr-2 h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      {t('attendance.checkOut')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t('attendance.completeForToday')}
                  </div>
                )}
              </div>

              {/* Right: GPS check-in panel */}
              <GpsCheckIn
                lat={geo.lat}
                lng={geo.lng}
                accuracy={geo.accuracy}
                error={geo.error}
                loading={geo.loading}
                retry={geo.retry}
                employeeOffice={employeeOffice}
                confirmedOffice={confirmedOffice}
                locationSource={locationSource}
                branches={branches}
                confirmedBranch={confirmedBranch}
              />
            </div>
        </div>

        {/* ── My History ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-base font-semibold text-gray-800">{t('attendance.myHistory')}</h3>
          </div>

          {myLoading ? (
            <PageSpinner />
          ) : (
            <>
              {/* ── Mobile card list ── */}
              <div className="sm:hidden divide-y divide-gray-50">
                {myRecords?.data.length === 0 && (
                  <p className="px-5 py-10 text-center text-sm text-gray-400">{t('attendance.noRecordsYet')}</p>
                )}
                {myRecords?.data.map((rec) => (
                  <div key={rec.id} className="px-4 py-3 space-y-2">
                    {/* Row 1: date + hours */}
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-800 text-sm">{formatDate(rec.date)}</span>
                      <span className="font-bold text-indigo-600 text-sm">{formatHours(rec.workingHours)}</span>
                    </div>
                    {/* Row 2: shift */}
                    {rec.shift && (
                      <p className="text-xs text-gray-500">
                        {rec.shift.name}
                        <span className="ml-1 text-gray-400">{rec.shift.startTime}–{rec.shift.endTime}</span>
                      </p>
                    )}
                    {/* Row 3: checkin / checkout */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-emerald-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase text-emerald-500 mb-0.5">{t('attendance.checkinLabel')}</p>
                        <p className="font-medium text-gray-700">{rec.checkinTime ? formatDateTime(rec.checkinTime).split(' ')[1] : '--:--'}</p>
                      </div>
                      <div className="rounded-lg bg-orange-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase text-orange-500 mb-0.5">{t('attendance.checkoutLabel')}</p>
                        <p className="font-medium text-gray-700">{rec.checkoutTime ? formatDateTime(rec.checkoutTime).split(' ')[1] : '--:--'}</p>
                      </div>
                    </div>
                    {/* Row 4: status badges */}
                    <div className="flex flex-wrap gap-1">
                      <WfmBadges record={rec} />
                      {rec.isInOffice !== undefined && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          rec.isInOffice ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                        }`}>
                          {rec.isInOffice ? t('attendance.inOfficeLabel') : t('attendance.outsideLabel')}
                        </span>
                      )}
                    </div>
                    {/* Row 5: notes */}
                    {(rec.checkinNote || rec.checkoutNote) && (
                      <div className="space-y-1 text-[11px] text-gray-500">
                        {rec.checkinNote && <p className="bg-gray-50 rounded px-2 py-1"><span className="font-semibold text-gray-400">IN:</span> {rec.checkinNote}</p>}
                        {rec.checkoutNote && <p className="bg-gray-50 rounded px-2 py-1"><span className="font-semibold text-gray-400">OUT:</span> {rec.checkoutNote}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Desktop table ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-6 py-3 text-left">{t('common.date')}</th>
                      <th className="px-6 py-3 text-left">{t('attendance.shiftLabel')}</th>
                      <th className="px-6 py-3 text-left">{t('attendance.checkinLabel')}</th>
                      <th className="px-6 py-3 text-left">{t('attendance.checkoutLabel')}</th>
                      <th className="px-6 py-3 text-left">{t('reports.colHours')}</th>
                      <th className="px-6 py-3 text-left">{t('common.status')}</th>
                      <th className="px-6 py-3 text-left">{t('common.notes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {myRecords?.data.map((rec) => (
                      <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-gray-700">{formatDate(rec.date)}</td>
                        <td className="px-6 py-3 text-gray-500 text-xs">
                          {rec.shift ? `${rec.shift.name}` : '—'}
                          {rec.shift && (
                            <span className="block text-gray-400">
                              {rec.shift.startTime}–{rec.shift.endTime}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-600">{formatDateTime(rec.checkinTime)}</td>
                        <td className="px-6 py-3 text-gray-600">{formatDateTime(rec.checkoutTime)}</td>
                        <td className="px-6 py-3 font-medium text-indigo-600">{formatHours(rec.workingHours)}</td>
                        <td className="px-6 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <WfmBadges record={rec} />
                            {rec.isInOffice !== undefined && (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                rec.isInOffice
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-600'
                              }`}>
                                {rec.isInOffice ? t('attendance.inOfficeLabel') : t('attendance.outsideLabel')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex flex-col gap-1 text-[10px] text-gray-500 max-w-[200px]">
                            {rec.checkinNote && (
                              <div className="bg-gray-50 p-1 rounded">
                                <span className="font-bold text-gray-400">IN:</span> {rec.checkinNote}
                              </div>
                            )}
                            {rec.checkoutNote && (
                              <div className="bg-gray-50 p-1 rounded">
                                <span className="font-bold text-gray-400">OUT:</span> {rec.checkoutNote}
                              </div>
                            )}
                            {!rec.checkinNote && !rec.checkoutNote && <span className="text-gray-300 italic uppercase tracking-widest text-[9px]">{t('common.noData')}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {myRecords?.data.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                          {t('attendance.noRecordsYet')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {myRecords && myRecords.meta.totalPages > 1 && (
                <Pagination
                  page={myPage}
                  totalPages={myRecords.meta.totalPages}
                  total={myRecords.meta.total}
                  limit={myLimit}
                  onPrev={myPrev}
                  onNext={myNext}
                />
              )}
            </>
          )}
        </div>

        {/* ── Admin / HR / Manager Report ── */}
        {isManager && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-800">{t('attendance.attendanceReport')}</h3>
            </div>

            {/* Filters */}
            <div className="border-b border-gray-100 p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setActiveFilter({ dateFrom, dateTo });
                  reset();
                }}
                className="flex flex-wrap items-end gap-3"
              >
                <Input label={t('reports.fromDate')} type="date" value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)} />
                <Input label={t('reports.toDate')} type="date" value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)} />
                <Button type="submit" variant="secondary">{t('common.filter')}</Button>
                <Button type="button" variant="ghost"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setActiveFilter({ dateFrom: '', dateTo: '' });
                    reset();
                  }}>
                  {t('common.clear')}
                </Button>
              </form>
            </div>

            {/* Summary */}
            {report?.summary && (
              <div className="grid grid-cols-2 gap-4 border-b border-gray-100 p-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{report.summary.totalRecords}</p>
                  <p className="text-sm text-gray-500">{t('reports.totalRecords')}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {Number(report.summary.totalWorkingHours).toFixed(1)}
                  </p>
                  <p className="text-sm text-gray-500">{t('reports.totalWorkingHours')}</p>
                </div>
              </div>
            )}

            {reportLoading ? (
              <PageSpinner />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-6 py-3 text-left">{t('reports.colEmployee')}</th>
                        <th className="px-6 py-3 text-left">{t('common.date')}</th>
                        <th className="px-6 py-3 text-left">{t('attendance.shiftLabel')}</th>
                        <th className="px-6 py-3 text-left">{t('attendance.checkinLabel')}</th>
                        <th className="px-6 py-3 text-left">{t('attendance.checkoutLabel')}</th>
                        <th className="px-6 py-3 text-left">{t('reports.colHours')}</th>
                        <th className="px-6 py-3 text-left">{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {report?.data.map((rec) => (
                        <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3">
                            <p className="font-medium text-gray-900">
                              {rec.employee?.fullName ?? `#${rec.employeeId}`}
                            </p>
                            <p className="text-xs text-gray-400">{rec.employee?.code}</p>
                          </td>
                          <td className="px-6 py-3 text-gray-600">{formatDate(rec.date)}</td>
                          <td className="px-6 py-3 text-gray-500 text-xs">{rec.shift?.name ?? '—'}</td>
                          <td className="px-6 py-3 text-gray-600">{formatDateTime(rec.checkinTime)}</td>
                          <td className="px-6 py-3 text-gray-600">{formatDateTime(rec.checkoutTime)}</td>
                          <td className="px-6 py-3 font-medium text-indigo-600">{formatHours(rec.workingHours)}</td>
                          <td className="px-6 py-3"><WfmBadges record={rec} /></td>
                        </tr>
                      ))}
                      {report?.data.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                            {t('attendance.noRecordsForPeriod')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {report && report.meta.totalPages > 1 && (
                  <Pagination
                    page={page}
                    totalPages={report.meta.totalPages}
                    total={report.meta.total}
                    limit={limit}
                    onPrev={prev}
                    onNext={next}
                  />
                )}
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Checkout confirm modal ── */}
      <Modal
        open={showCheckoutConfirm}
        onClose={() => setShowCheckoutConfirm(false)}
        title={t('attendance.confirmCheckoutTitle', 'Xác nhận chấm công ra')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCheckoutConfirm(false)} disabled={actionLoading}>
              {t('common.cancel', 'Hủy')}
            </Button>
            <Button
              loading={actionLoading}
              onClick={() => { setShowCheckoutConfirm(false); handleCheckOut(); }}
            >
              {t('attendance.confirmCheckout', 'Xác nhận ra')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-gray-600">
          <p>{t('attendance.confirmCheckoutMsg', 'Bạn có chắc muốn chấm công ra không?')}</p>
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('attendance.currentTime', 'Thời gian hiện tại')}</p>
            <p className="text-2xl font-bold text-gray-800 tabular-nums">
              {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </Modal>

    </AppShell>
  );
}
