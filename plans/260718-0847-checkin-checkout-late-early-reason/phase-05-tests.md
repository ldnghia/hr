# Phase 05 — Tests

## Context Links
- `backend/src/attendance/helpers/session-hours.ts` (source of truth for flags)
- Phase 03 `predict-late-early.ts` (must match backend)

## Overview
Priority P2. Verify the backend guard, the client-prediction parity, and the end-to-end reason
persistence (Attendance + AttendanceLog).

## Test Matrix
Backend unit (service / DTO):
- checkIn late + no lateReason → 400 (message contains `reason`).
- checkIn late + lateReason → 200; Attendance.lateReason set; check_in AttendanceLog.reason set; note unaffected.
- checkIn on-time + no reason → 200; reasons null.
- checkOut early + no earlyReason → 400.
- checkOut early + earlyReason → 200; Attendance.earlyReason + check_out AttendanceLog.reason set.
- checkOut not-early → 200; reasons null.
- checkOut via attendanceId (previous-day unclosed) early → guard still applies.
- forgotCheckout path → unaffected (no isEarlyOut computed).

Backend integration:
- `my-shifts/current-month` returns grace/isCrossDay/breakMinutes for all 3 branches (deptShifts, assignments, defaultShift).

Prediction parity (frontend unit — Vitest/Jest):
For a table of (shift, checkinTime/checkoutTime) cases, assert `predictIsLate`/`predictIsEarlyOut`
equal backend `computeSessionFlags` output. Cases:
- exactly at grace boundary (start+grace) → not late; +1min → late.
- cross-day shift (23:00–07:00): early arrival 22:51 → not late; post-midnight 01:30 late calc.
- early-out boundary: workingHours == normalHours-graceEarly → not early; -1min → early.
- break minutes subtracted correctly.

Frontend flow (component / manual):
- late prediction opens modal, blocks empty submit, submits with lateReason.
- early prediction modal for checkout.
- no-shift employee → no modal, no crash.
- outside-office + late → both location reason and late reason captured.

## Edge Cases to Assert
- Client clock skew: if client predicts on-time but server says late → backend 400 surfaced via existing `reason` error branch (no silent success).
- Cross-day normalization identical both sides.

## Todo
- [ ] backend service tests (checkin/checkout guard + persistence both tables)
- [ ] my-shifts endpoint field test (3 branches)
- [ ] prediction parity unit tests
- [ ] frontend flow tests / manual smoke
- [ ] all pass, no fake/mocked DB shortcuts per rules

## Success Criteria
All matrix cases pass; prediction parity holds on every boundary case; no regression in existing
attendance tests.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Parity tests omit a boundary → drift ships | Med | High | Explicit boundary cases above are mandatory |
| Timezone in test dates (VN UTC+7) | Med | Med | Construct Dates matching how service builds `ts`; reuse computeSessionDate expectations |

## Next Steps
On green → code-reviewer, then docs update (changelog + system-architecture attendance section).
</content>
