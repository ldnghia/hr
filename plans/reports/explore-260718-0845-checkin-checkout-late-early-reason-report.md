# Explore: Check-in/Check-out Late/Early Detection and Reason Fields

Date: 2026-07-18

## 1. Check-in/Check-out API (employee self, GPS-based)

- Controller: backend/src/attendance/attendance.controller.ts
  - Check-in handler line 69: checkIn(dto, employeeId, req) calls attendanceService.checkIn(employeeId, dto, req.ip) at line 70
  - Check-out handler line 85: checkOut(dto, employeeId, req) calls attendanceService.checkOut(employeeId, dto, req.ip) at line 86
  - Generic combined endpoint line 209-210: checkInOut(dto) calls attendanceService.checkInOut(employeeId, dto.type, dto.timestamp)
- Actual business logic lives in backend/src/attendance/attendance-checkin.service.ts (AttendanceCheckinService):
  - checkIn() lines 23-224
  - checkOut() lines 228-400
  - markForgotCheckout() lines 404-421

## 2. Late / Early computation logic

Central helper: backend/src/attendance/helpers/session-hours.ts

- computeSessionFlags(checkinTime, checkoutTime, shift) lines 43-80
  - isLate at line 65: normalCheckin > startMin + shift.graceLateMinutes (checkin minutes, normalized for cross-day shifts, vs shift start plus grace)
  - isEarlyOut at line 75: workingHours < normalHours - graceEarlyH (worked hours vs expected shift hours minus grace-early)
  - also returns isOvertime / overtimeHours
- Call sites:
  - attendance-checkin.service.ts line 156: const { isLate } = computeSessionFlags(ts, null, shift) inside checkIn()
  - attendance-checkin.service.ts lines 352-356: const { workingHours, isEarlyOut, isOvertime, overtimeHours } = computeSessionFlags(target.checkinTime, ts, shift) inside checkOut()
- Second, independent raw-minutes calculator used only for reporting/export (not stored as DB flags): calcLateEarlyMinutes() in backend/src/attendance/attendance-export-late-early-sheet.ts lines 20-48. Computes literal late/early minute counts (no grace subtracted) for the late/early Excel sheet; comment says it mirrors a frontend calcLateEarlyMinutes used on the web report (not located as separate file in this pass).

Grace minutes come from the Shift model: graceLateMinutes (default 15), graceEarlyMinutes (default 15).

## 3. Existing note/reason fields

Prisma schema: backend/prisma/schema.prisma, model Attendance (lines 322-361):
- locationNote (location_note) String? - reason captured for outside-geofence / no-GPS check-in or check-out (shared field for both directions)
- checkinNote (checkin_note) String? - populated as unknownDeviceNote + locationNote in attendance-checkin.service.ts line 171
- checkoutNote (checkout_note) String? - populated similarly at line 369; also overwritten to "Quen checkout" by markForgotCheckout() line 416
- No dedicated lateReason / earlyReason field exists. The only reason captured today concerns GPS/geofence location, not lateness or early leave.
- AttendanceLog model (lines 301-321) also has a generic note field, populated with locationNote on each check-in/check-out audit-log entry (service lines 208, 388).

Shift model (backend/prisma/schema.prisma lines 248-271): startTime, endTime (strings HH:mm), breakMinutes, graceLateMinutes, graceEarlyMinutes, isCrossDay, isActive.

## 4. Frontend check-in/check-out UI

- Page: frontend/src/app/attendance/page.tsx - "attendance" tab (around line 166) renders the self check-in/out UI.
  - GpsCheckInPanel: frontend/src/app/attendance/components/gps-check-in-panel.tsx (308 lines) - GPS status display and check-in/out actions.
  - TodaySessionsList: frontend/src/app/attendance/components/today-sessions-list.tsx - renders sessions with onCheckIn/onCheckOut handlers (page.tsx lines 195-204).
  - UnclosedSessionWarningBanner - banner for forgotten checkouts.
  - DailySummaryCard - daily summary.

- Closest existing analog to a reason-capture UI: LocationReasonBox at frontend/src/app/attendance/components/location-reason-box.tsx (67 lines).
  - This is NOT a modal/dialog. It is an inline amber warning box plus a textarea, conditionally rendered in-page: page.tsx lines 185-194, "{needsReason && <LocationReasonBox .../>}".
  - Props: isOutside, geoStatus, locationNote, noteError, noteRef, onChange.
  - Captures free-text reason before check-in/check-out submit when GPS is unavailable or the employee is outside the geofence; wired to locationNote state in page.tsx and sent as dto.locationNote to the backend.
  - This pattern could be reused/adapted for a late/early reason capture flow, but there is currently no dedicated component for that purpose.
  - True modal components DO exist in this feature area for other purposes and show the codebase modal conventions: checkout-shift-picker-modal.tsx, correction-request-form-modal.tsx, correction-edit-modal.tsx, correction-without-record-modal.tsx, correction-review-modal.tsx (all under frontend/src/app/attendance/components/).

## 5. attendance-export-late-early-sheet.ts (untracked new file)

Path: backend/src/attendance/attendance-export-late-early-sheet.ts (untracked per git status).

- Purpose: builds a shared "Di tre ve som" (late/early) Excel worksheet, appended to both the grid (FIXED) and summary (SHIFT) exports, so admins can review real late/early incidents without scanning every on-time row.
- Exports buildLateEarlySheet(wb, records) at line 53.
- Uses calcLateEarlyMinutes() (lines 20-48), comparing raw checkin/checkout clock time against shift start/end anchored to the checkin/checkout own calendar date (handles cross-day shifts). Deliberately does NOT subtract graceLateMinutes/graceEarlyMinutes, to match the Tre/Som columns already shown on the web report.
- Filters to rows where late > 0 or early > 0 (line 74), groups by employee, shows KPI totals (count and total minutes) for late/early, colors late/early cells.
- Only surfaces checkinNote/checkoutNote as a combined "Ghi chu" column (line 71) - reuses the general note fields; there is no structured late/early-specific reason to show yet.
- This file is purely an export/reporting artifact, not part of the live check-in/check-out API path. It consumes already-computed Attendance rows (with shift and employee relations) passed in by an export service - likely attendance-export-combined.service.ts, attendance-export-grid.service.ts, or attendance-export-summary.service.ts (all present, and attendance-export-combined.service.ts is currently modified per git status).

## 6. Recent related git history

41c8527 feat(attendance): track in-office/outside status for check-out and surface it in reports
c919990 feat(leave): support CC half-day leave tied to specific shift
826da26 fix(attendance): correct date range in Excel export, avoid UTC+7 setHours shift
22313cb fix(attendance): correct isLate for cross-day shifts, only normalize post-midnight checkins
125203e fix(attendance): add deletedAt null filters across all attendance queries and guards
2c9549e update: export excel
72e66f6 update: export CC
3869959 feat(attendance-correction): support multi-shift corrections and approval recomputation
5c899a0 fix(attendance): use VN timezone (UTC+7) for session date calculation
3e569da feat: add device registration validation for attendance check-in
e69f743 feat: forgot-checkout feature, responsive tables, remove PWA service worker
26cfff1 feat: attendance CC report improvements, combined Excel export, leave/login UI updates
df463ce feat: implement multi-shift attendance with GPS check-in and shift management

No commit yet ties a reason field to lateness/early-leave. The only reason-capture flow that exists is for GPS/geofence location (locationNote). attendance-export-late-early-sheet.ts is uncommitted work in progress, purely on the reporting side.

## Key file:line references

- Check-in controller route: backend/src/attendance/attendance.controller.ts:69-70
- Check-out controller route: backend/src/attendance/attendance.controller.ts:85-86
- Check-in service logic: backend/src/attendance/attendance-checkin.service.ts:23-224
- Check-out service logic: backend/src/attendance/attendance-checkin.service.ts:228-400
- isLate computation: backend/src/attendance/helpers/session-hours.ts:65
- isEarlyOut computation: backend/src/attendance/helpers/session-hours.ts:75
- Attendance model (note fields): backend/prisma/schema.prisma:322-361
- Shift model (start/end/grace): backend/prisma/schema.prisma:248-271
- Frontend inline reason box: frontend/src/app/attendance/components/location-reason-box.tsx:1-67
- Frontend reason box usage: frontend/src/app/attendance/page.tsx:185-194
- Existing modal components (pattern reference): frontend/src/app/attendance/components/checkout-shift-picker-modal.tsx, correction-request-form-modal.tsx, correction-edit-modal.tsx, correction-without-record-modal.tsx, correction-review-modal.tsx
- Late/early export sheet: backend/src/attendance/attendance-export-late-early-sheet.ts:1-172

## Unresolved questions

1. Should a new lateReason / earlyReason field be added to Attendance, distinct from the existing locationNote/checkinNote/checkoutNote (which are about GPS/device, not lateness)?
2. Should reason capture happen client-side proactively (predict lateness from shift time before submit, similar to LocationReasonBox) or server-side (backend returns isLate/isEarlyOut, frontend then shows a follow-up modal to collect and PATCH a reason after the fact)?
3. Is attendance-export-late-early-sheet.ts meant to be wired into an existing export service already, or does it still need integration (it is untracked/new and not yet referenced by any caller found in this pass)?
