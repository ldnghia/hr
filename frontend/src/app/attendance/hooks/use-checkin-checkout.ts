'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { attendanceService } from '@/services/attendance.service';
import type { MultipleOpenSessionsError, NearestBranch } from '@/services/attendance.service';
import { formatDateTime } from '@/utils/format';
import { getDeviceFingerprint } from '@/lib/device-fingerprint';
import { predictIsLate, predictIsEarlyOut } from '../utils/predict-late-early';
import type { AttendanceSession, MonthlyShift } from '@/types';

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
  /** This month's assigned shifts — used to predict late/early client-side before submit */
  shifts: MonthlyShift[];
  /** Today's open sessions — used to look up checkinTime for early-out prediction */
  sessions: AttendanceSession[];
}

interface ReasonModalState {
  open: boolean;
  kind: 'late' | 'early' | null;
  value: string;
  error: string;
}

type PendingAction =
  | { type: 'checkin'; shiftId: number }
  | { type: 'checkout'; shiftId: number }
  | { type: 'picker'; shiftId: number };

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
  reasonModal: ReasonModalState;
  setReasonModalValue: (v: string) => void;
  confirmReasonModal: () => Promise<void>;
  cancelReasonModal: () => void;
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
  shifts,
  sessions,
}: UseCheckinCheckoutOptions): UseCheckinCheckoutResult {
  const { t } = useTranslation();
  const [loadingShiftId, setLoadingShiftId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSessions, setPickerSessions] = useState<MultipleOpenSessionsError['openSessions']>([]);
  const pendingRef = useRef<{ lat?: number; lng?: number; locationNote?: string }>({});
  const [reasonModal, setReasonModal] = useState<ReasonModalState>({ open: false, kind: null, value: '', error: '' });
  const pendingActionRef = useRef<PendingAction | null>(null);

  function guardReason(): boolean {
    if (needsReason && !locationNote.trim()) {
      setNoteError(t('attendance.pleaseEnterReason'));
      noteRef.current?.focus();
      return false;
    }
    setNoteError('');
    return true;
  }

  async function gpsPayload(shiftId?: number, lateReason?: string, earlyReason?: string) {
    const deviceId = await getDeviceFingerprint();
    return {
      lat: geo.lat ?? undefined,
      lng: geo.lng ?? undefined,
      deviceId,
      locationNote: needsReason ? locationNote.trim() : undefined,
      lateReason,
      earlyReason,
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

  function openReasonModal(kind: 'late' | 'early', action: PendingAction) {
    pendingActionRef.current = action;
    setReasonModal({ open: true, kind, value: '', error: '' });
  }

  function setReasonModalValue(v: string) {
    setReasonModal((s) => ({ ...s, value: v, error: '' }));
  }

  function cancelReasonModal() {
    pendingActionRef.current = null;
    setReasonModal({ open: false, kind: null, value: '', error: '' });
  }

  async function confirmReasonModal() {
    const action = pendingActionRef.current;
    if (!action) return;
    if (!reasonModal.value.trim()) {
      setReasonModal((s) => ({ ...s, error: t('attendance.pleaseEnterReason') }));
      return;
    }
    const reason = reasonModal.value.trim();
    setReasonModal({ open: false, kind: null, value: '', error: '' });
    pendingActionRef.current = null;

    if (action.type === 'checkin') await doCheckIn(action.shiftId, reason);
    else if (action.type === 'checkout') await doCheckOut(action.shiftId, reason);
    else await doPickerSelect(action.shiftId, reason);
  }

  async function doCheckIn(shiftId: number, lateReason?: string) {
    setLoadingShiftId(shiftId);
    try {
      const result = await attendanceService.checkIn(await gpsPayload(shiftId, lateReason));
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
        // Server disagreed with the client prediction (e.g. clock skew) — reopen the modal.
        openReasonModal('late', { type: 'checkin', shiftId });
        setReasonModal((s) => ({ ...s, error: msg }));
      } else {
        setActionMsg({ type: 'error', text: msg });
      }
    } finally {
      setLoadingShiftId(null);
    }
  }

  async function doCheckOut(shiftId: number, earlyReason?: string) {
    setLoadingShiftId(shiftId);
    const payload = await gpsPayload(shiftId, undefined, earlyReason);
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
        openReasonModal('early', { type: 'checkout', shiftId });
        setReasonModal((s) => ({ ...s, error: msg }));
      } else {
        setActionMsg({ type: 'error', text: msg });
      }
      console.error('[attendance] Check-out failed:', msg);
    } finally {
      setLoadingShiftId(null);
    }
  }

  async function doPickerSelect(shiftId: number, earlyReason?: string) {
    setPickerOpen(false);
    setLoadingShiftId(shiftId);
    try {
      const result = await attendanceService.checkOut({ ...pendingRef.current, shiftId, earlyReason });
      setLocationNote(''); setForceReason(false);
      setActionMsg({ type: 'success', text: formatCheckoutMsg(result) });
      await refetchSessions();
    } catch (err) {
      const msg = extractErrMsg(err, 'Check-out failed.');
      if (msg.toLowerCase().includes('reason')) {
        openReasonModal('early', { type: 'picker', shiftId });
        setReasonModal((s) => ({ ...s, error: msg }));
      } else {
        setActionMsg({ type: 'error', text: msg });
      }
      console.error('[attendance] Picker checkout failed:', msg);
    } finally {
      setLoadingShiftId(null);
    }
  }

  async function handleCheckIn(shiftId: number) {
    setActionMsg(null);
    if (!guardReason()) return;
    const shift = shifts.find((s) => s.shiftId === shiftId);
    if (shift && predictIsLate(new Date(), shift)) {
      openReasonModal('late', { type: 'checkin', shiftId });
      return;
    }
    await doCheckIn(shiftId);
  }

  async function handleCheckOut(shiftId: number) {
    setActionMsg(null);
    if (!guardReason()) return;
    const shift = shifts.find((s) => s.shiftId === shiftId);
    const session = sessions.find((s) => s.shiftId === shiftId);
    if (shift && session?.checkinTime && predictIsEarlyOut(new Date(session.checkinTime), new Date(), shift)) {
      openReasonModal('early', { type: 'checkout', shiftId });
      return;
    }
    await doCheckOut(shiftId);
  }

  async function handlePickerSelect(shiftId: number) {
    const shift = shifts.find((s) => s.shiftId === shiftId);
    const picked = pickerSessions.find((s) => s.shiftId === shiftId);
    if (shift && picked?.checkinTime && predictIsEarlyOut(new Date(picked.checkinTime), new Date(), shift)) {
      openReasonModal('early', { type: 'picker', shiftId });
      return;
    }
    await doPickerSelect(shiftId);
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
    reasonModal,
    setReasonModalValue,
    confirmReasonModal,
    cancelReasonModal,
  };
}
