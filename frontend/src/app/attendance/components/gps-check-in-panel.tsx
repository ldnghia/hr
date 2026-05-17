'use client';

import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/Spinner';
import type { OfficeLocation, Branch } from '@/types';
import type { NearestBranch } from '@/services/attendance.service';

import { haversineMetres } from '@/utils/haversine';

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
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

// ─── Types ────────────────────────────────────────────────────────────────────

type OfficeStatus = 'IN_OFFICE' | 'OUTSIDE';

interface OfficeResult {
  name: string;
  distanceM: number;
  status: OfficeStatus;
  confirmed: boolean;
}

export interface GpsCheckInPanelProps {
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

// ─── Component ────────────────────────────────────────────────────────────────

export function GpsCheckInPanel({
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
}: GpsCheckInPanelProps) {
  const { t } = useTranslation();

  // ── Nearest branch: backend-confirmed > client-side haversine preview ──────
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
        best = { name: b.name, distanceM: dist, isInOffice: dist <= (b.radius ?? 50), confirmed: false };
      }
    }
    nearestBranchResult = best;
  }

  // ── Assigned office card (client-side preview or backend-confirmed) ────────
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

  // Employee is authorized if within assigned office OR any branch geofence
  const isInOffice = officeResult?.status === 'IN_OFFICE' || (nearestBranchResult?.isInOffice ?? false);

  // Show branch panel when no assigned office, or when in branch but outside assigned office
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

      {/* Error state */}
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

      {/* Assigned office status card */}
      {officeResult && (
        <div className={`rounded-lg border px-3 py-3 transition-colors ${
          isInOffice ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {isInOffice && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isInOffice ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </span>
              <span className={`text-sm font-semibold truncate ${isInOffice ? 'text-emerald-700' : 'text-red-700'}`}>
                {officeResult.name}
              </span>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${
              isInOffice ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
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

      {/* Nearest branch panel */}
      {!loading && !error && lat != null && showBranchPanel && (
        nearestBranchResult ? (
          <div className={`rounded-lg border px-3 py-3 transition-colors ${
            nearestBranchResult.isInOffice ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}>
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
                nearestBranchResult.isInOffice ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
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
          <p className="text-xs text-gray-400 text-center py-1">{t('attendance.gpsNoBranches')}</p>
        )
      )}

      {/* NO_LOCATION badge */}
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
