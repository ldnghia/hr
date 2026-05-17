'use client';

import { useTranslation } from 'react-i18next';
import { RefObject } from 'react';

export interface LocationReasonBoxProps {
  isOutside: boolean;
  geoStatus: string;
  locationNote: string;
  noteError: string;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}

/**
 * Amber warning box + textarea for when GPS is unavailable or employee is outside
 * an authorized geofence. Shown before check-in and check-out.
 */
export function LocationReasonBox({
  isOutside,
  geoStatus,
  locationNote,
  noteError,
  noteRef,
  onChange,
}: LocationReasonBoxProps) {
  const { t } = useTranslation();

  const headerText = isOutside
    ? t('attendance.outsideLocation')
    : geoStatus === 'acquiring'
      ? t('attendance.acquiringPosition')
      : t('attendance.locationNotAvailable');

  const labelText = isOutside
    ? t('attendance.reasonForCheckinOutside')
    : t('attendance.reasonForCheckinNoGps');

  const placeholder = isOutside
    ? t('attendance.checkInPlaceholderOutside')
    : t('attendance.checkInPlaceholderGps');

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-sm font-medium text-amber-800">{headerText}</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-amber-800">{labelText}</label>
        <textarea
          ref={noteRef}
          value={locationNote}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full resize-none rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {noteError && <p className="mt-1 text-xs font-medium text-red-600">{noteError}</p>}
      </div>
    </div>
  );
}
