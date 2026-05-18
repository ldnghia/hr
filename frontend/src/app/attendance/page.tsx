'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { employeeService } from '@/services/employee.service';
import { organizationService } from '@/services/organization.service';
import type { NearestBranch } from '@/services/attendance.service';
import { GpsCheckInPanel } from './components/gps-check-in-panel';
import { TodaySessionsList } from './components/today-sessions-list';
import { DailySummaryCard } from './components/daily-summary-card';
import { CheckoutShiftPickerModal } from './components/checkout-shift-picker-modal';
import { LocationReasonBox } from './components/location-reason-box';
import { MyAttendanceHistory } from './components/my-attendance-history';
import { CorrectionRequestList } from './components/correction-request-list';
import { CorrectionAdminPanel } from './components/correction-admin-panel';
import { HttpsWarningBanner } from './components/https-warning-banner';
import { useTodaySessions } from './hooks/use-today-sessions';
import { useCurrentMonthShifts } from './hooks/use-current-month-shifts';
import { useUnclosedSessions } from './hooks/use-unclosed-sessions';
import { useCheckinCheckout } from './hooks/use-checkin-checkout';
import { UnclosedSessionWarningBanner } from './components/unclosed-session-warning-banner';
import { haversineMetres } from '@/utils/haversine';
import type { OfficeLocation, Branch } from '@/types';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const geo = useGeolocation();

  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useTodaySessions();
  const { shifts, loading: shiftsLoading } = useCurrentMonthShifts();
  const { unclosed, refetch: refetchUnclosed } = useUnclosedSessions();

  // Working mode
  const [workingMode, setWorkingMode] = useState<string>('FIXED');

  // GPS / office
  const [employeeOffice, setEmployeeOffice] = useState<OfficeLocation | null>(null);
  const [confirmedOffice, setConfirmedOffice] = useState<{ status: 'IN_OFFICE' | 'OUTSIDE'; distanceM: number } | null>(null);
  const [confirmedBranch, setConfirmedBranch] = useState<NearestBranch | null>(null);
  const [locationSource, setLocationSource] = useState<'GPS' | 'NO_LOCATION' | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Location reason
  const [locationNote, setLocationNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [forceReason, setForceReason] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // UI
  const [isHttps, setIsHttps] = useState(true);
  const [activeTab, setActiveTab] = useState('attendance');
  const isAdminOrHr = !!(user && ['admin', 'hr'].includes(user.role));
  const isManager = !!(user && ['admin', 'hr', 'manager'].includes(user.role));

  const tabs = [
    { key: 'attendance', label: t('attendance.myAttendanceTab') },
    { key: 'my-corrections', label: t('attendance.myCorrectionRequests') },
    ...(isAdminOrHr ? [{ key: 'manage-corrections', label: t('attendance.manageCorrectionRequests') }] : []),
  ];

  // Bootstrap
  useEffect(() => {
    setIsHttps(window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.allSettled([employeeService.get(user.id), organizationService.branches()])
      .then(([profileRes, branchesRes]) => {
        if (profileRes.status === 'fulfilled') {
          if (profileRes.value.office) setEmployeeOffice(profileRes.value.office);
          setWorkingMode(profileRes.value.workingMode ?? 'FIXED');
        }
        if (branchesRes.status === 'fulfilled') setBranches(branchesRes.value);
      });
  }, [user]);

  // Geofence
  const inAssignedOffice = geo.lat != null && geo.lng != null && employeeOffice
    ? haversineMetres(geo.lat, geo.lng, employeeOffice.latitude, employeeOffice.longitude) <= employeeOffice.radius
    : false;
  const inAnyBranch = geo.lat != null && geo.lng != null
    ? branches.some((b) => b.latitude != null && b.longitude != null &&
        haversineMetres(geo.lat!, geo.lng!, b.latitude, b.longitude) <= (b.radius ?? 50))
    : false;
  const isOutside = geo.lat != null && geo.lng != null && !inAssignedOffice && !inAnyBranch;
  const needsReason = geo.status !== 'success' || isOutside || forceReason;

  useEffect(() => {
    if (['denied', 'unavailable', 'timeout', 'unsupported'].includes(geo.status)) noteRef.current?.focus();
  }, [geo.status]);

  useEffect(() => {
    if (geo.status === 'success') { setLocationNote(''); setNoteError(''); setForceReason(false); }
  }, [geo.status]);

  // Check-in / check-out actions
  const {
    loadingShiftId, actionMsg,
    pickerOpen, pickerSessions, setPickerOpen,
    handleCheckIn, handleCheckOut, handlePickerSelect,
  } = useCheckinCheckout({
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
  });

  // Mark unclosed sessions as "forgot checkout" — leaves checkoutTime empty
  async function handleUnclosedCheckOut(attendanceId: number) {
    try {
      await import('@/services/attendance.service').then(({ attendanceService: svc }) =>
        svc.markForgotCheckout(attendanceId),
      );
      await Promise.all([refetchSessions(), refetchUnclosed()]);
    } catch {
      // non-critical: banner stays visible if request fails
    }
  }

  return (
    <AppShell title={t('attendance.title')}>
      <div className="space-y-6">

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === 'my-corrections' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
            <h3 className="mb-4 text-base font-semibold text-gray-800">{t('attendance.myCorrectionRequests')}</h3>
            <CorrectionRequestList />
          </div>
        )}

        {activeTab === 'manage-corrections' && isAdminOrHr && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
            <h3 className="mb-4 text-base font-semibold text-gray-800">{t('attendance.manageCorrectionRequests')}</h3>
            <CorrectionAdminPanel />
          </div>
        )}

        {activeTab === 'attendance' && (
          <>
            {!isHttps && <HttpsWarningBanner />}

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-4">
                <h3 className="text-base font-semibold text-gray-800">{t('attendance.todaySessionsTitle')}</h3>
              </div>
              <div className="p-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  {actionMsg && <Alert variant={actionMsg.type === 'success' ? 'success' : 'error'} message={actionMsg.text} />}
                  <UnclosedSessionWarningBanner
                    sessions={unclosed}
                    loadingShiftId={loadingShiftId}
                    onCheckOut={(shiftId) => {
                      const record = unclosed.find((s) => s.shiftId === shiftId);
                      if (record) handleUnclosedCheckOut(record.id);
                    }}
                  />
                  {needsReason && (
                    <LocationReasonBox
                      isOutside={isOutside}
                      geoStatus={geo.status}
                      locationNote={locationNote}
                      noteError={noteError}
                      noteRef={noteRef}
                      onChange={(v) => { setLocationNote(v); setNoteError(''); }}
                    />
                  )}
                  <TodaySessionsList
                    sessions={sessions} shifts={shifts}
                    sessionsLoading={sessionsLoading} shiftsLoading={shiftsLoading}
                    loadingShiftId={loadingShiftId}
                    onCheckIn={handleCheckIn} onCheckOut={handleCheckOut}
                    isShiftEmployee={workingMode === 'SHIFT'}
                    onAutoCheckIn={handleCheckIn}
                    unclosedSessions={unclosed}
                  />
                  <DailySummaryCard sessions={sessions} />
                </div>
                <GpsCheckInPanel
                  lat={geo.lat} lng={geo.lng} accuracy={geo.accuracy}
                  error={geo.error} loading={geo.loading} retry={geo.retry}
                  employeeOffice={employeeOffice} confirmedOffice={confirmedOffice}
                  locationSource={locationSource} branches={branches} confirmedBranch={confirmedBranch}
                />
              </div>
            </div>

            <MyAttendanceHistory isAdminOrHr={isAdminOrHr} />
          </>
        )}

      </div>

      <CheckoutShiftPickerModal
        open={pickerOpen} openSessions={pickerSessions}
        loading={loadingShiftId !== null}
        onSelect={handlePickerSelect} onClose={() => setPickerOpen(false)}
      />
    </AppShell>
  );
}
