'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { attendanceService } from '@/services/attendance.service';
import type { MultipleOpenSessionsError, NearestBranch } from '@/services/attendance.service';
import { formatDateTime } from '@/utils/format';
import { getDeviceFingerprint } from '@/lib/device-fingerprint';

interface GeoState {
  lat: number | null;
  lng: number | null;
  status: string;
}

interface UseCheckinCheckoutOptions {
  geo: GeoState;
  needsReason: boolean;
  locationNote: string;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
  setLocationNote: (v: string) => void;
  setNoteError: (v: string) => void;
  setForceReason: (v: boolean) => void;
  setConfirmedOffice: (v: { status: 'IN_OFFICE' | 'OUTSIDE'; distanceM: number } | null) => void;
  setConfirmedBranch: (v: NearestBranch | null) => void;
  setLocationSource: (v: 'GPS' | 'NO_LOCATION' | null) => void;
  refetchSessions: () => Promise<void>;
}

export interface UseCheckinCheckoutResult {
  loadingShiftId: number | null;
  actionMsg: { type: 'success' | 'error'; text: string } | null;
  pickerOpen: boolean;
  pickerSessions: MultipleOpenSessionsError['openSessions'];
  setPickerOpen: (v: boolean) => void;
  handleCheckIn: (shiftId: number) => Promise<void>;
  handleCheckOut: (shiftId: number) => Promise<void>;
  handlePickerSelect: (shiftId: number) => Promise<void>;
  /** Returns true if a reason isn't required or is already filled in; otherwise
   *  focuses the reason box and sets the error, without performing check-out. */
  guardReason: () => boolean;
}

/** Encapsulates check-in / check-out / picker logic for the attendance page. */
export function useCheckinCheckout({
  geo,
  needsReason,
  locationNote,
  noteRef,
  setLocationNote,
  setNoteError,
  setForceReason,
  setConfirmedOffice,
  setConfirmedBranch,
  setLocationSource,
  refetchSessions,
}: UseCheckinCheckoutOptions): UseCheckinCheckoutResult {
  const { t } = useTranslation();
  const [loadingShiftId, setLoadingShiftId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSessions, setPickerSessions] = useState<MultipleOpenSessionsError['openSessions']>([]);
  const pendingRef = useRef<{ lat?: number; lng?: number; locationNote?: string }>({});

  function guardReason(): boolean {
    if (needsReason && !locationNote.trim()) {
      setNoteError(t('attendance.pleaseEnterReason'));
      noteRef.current?.focus();
      return false;
    }
    setNoteError('');
    return true;
  }

  async function gpsPayload(shiftId?: number) {
    const deviceId = await getDeviceFingerprint();
    return {
      lat: geo.lat ?? undefined,
      lng: geo.lng ?? undefined,
      deviceId,
      locationNote: needsReason ? locationNote.trim() : undefined,
      // Always send shiftId so backend skips auto-detection and uses the correct shift
      ...(shiftId ? { shiftId } : {}),
    };
  }

  function formatCheckoutMsg(result: { workingHours: number | string; isOvertime: boolean; overtimeHours: number | string; isEarlyOut: boolean }): string {
    let msg = `${t('attendance.checkOut')} · ${Number(result.workingHours).toFixed(1)}h`;
    if (result.isOvertime) msg += ` · OT ${Number(result.overtimeHours).toFixed(1)}h`;
    if (result.isEarlyOut) msg += ` · ${t('attendance.earlyOut')}`;
    return msg;
  }

  function extractErrMsg(err: unknown, fallback: string): string {
    return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
  }

  async function handleCheckIn(shiftId: number) {
    setActionMsg(null);
    if (!guardReason()) return;
    setLoadingShiftId(shiftId);
    try {
      const result = await attendanceService.checkIn(await gpsPayload(shiftId));
      if (result.office) setConfirmedOffice(result.office);
      if (result.nearestBranch) setConfirmedBranch(result.nearestBranch);
      setLocationSource(result.locationSource ?? null);
      setLocationNote('');
      setForceReason(false);
      let msg = result.isLate
        ? `${t('attendance.checkIn')} ${formatDateTime(result.attendance.checkinTime)} — ${t('attendance.late')}`
        : `${t('attendance.checkIn')} ${formatDateTime(result.attendance.checkinTime)} — ${t('attendance.onTime')}`;
      if (result.isUnknownDevice) msg += ` · ⚠️ Thiết bị chưa đăng ký`;
      setActionMsg({ type: result.isLate ? 'error' : 'success', text: msg });
      await refetchSessions();
    } catch (err) {
      const msg = extractErrMsg(err, 'Check-in failed. Please try again.');
      console.error('[attendance] Check-in failed:', msg);
      if (msg.includes('Thiết bị chưa được đăng ký')) {
        setActionMsg({ type: 'error', text: `${msg} → Vào trang /devices để đăng ký.` });
      } else if (msg.toLowerCase().includes('reason')) {
        setForceReason(true); setNoteError(msg);
      } else {
        setActionMsg({ type: 'error', text: msg });
      }
    } finally {
      setLoadingShiftId(null);
    }
  }

  async function handleCheckOut(shiftId: number) {
    setActionMsg(null);
    if (!guardReason()) return;
    setLoadingShiftId(shiftId);
    const payload = await gpsPayload(shiftId);
    try {
      const result = await attendanceService.checkOut(payload);
      setLocationNote(''); setForceReason(false);
      setActionMsg({ type: 'success', text: formatCheckoutMsg(result) });
      await refetchSessions();
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errData = (err as any)?.response?.data;
      const msg: string = errData?.message ?? 'Check-out failed. Please try again.';
      const openSessions = errData?.openSessions as MultipleOpenSessionsError['openSessions'] | undefined;
      if (openSessions?.length) {
        pendingRef.current = payload;
        setPickerSessions(openSessions);
        setPickerOpen(true);
      } else if (msg.toLowerCase().includes('reason')) {
        setForceReason(true); setNoteError(msg);
      } else {
        setActionMsg({ type: 'error', text: msg });
      }
      console.error('[attendance] Check-out failed:', msg);
    } finally {
      setLoadingShiftId(null);
    }
  }

  async function handlePickerSelect(shiftId: number) {
    setPickerOpen(false);
    setLoadingShiftId(shiftId);
    try {
      const result = await attendanceService.checkOut({ ...pendingRef.current, shiftId });
      setLocationNote(''); setForceReason(false);
      setActionMsg({ type: 'success', text: formatCheckoutMsg(result) });
      await refetchSessions();
    } catch (err) {
      const msg = extractErrMsg(err, 'Check-out failed.');
      setActionMsg({ type: 'error', text: msg });
      console.error('[attendance] Picker checkout failed:', msg);
    } finally {
      setLoadingShiftId(null);
    }
  }

  return {
    loadingShiftId,
    actionMsg,
    pickerOpen,
    pickerSessions,
    setPickerOpen,
    handleCheckIn,
    handleCheckOut,
    handlePickerSelect,
    guardReason,
  };
}
