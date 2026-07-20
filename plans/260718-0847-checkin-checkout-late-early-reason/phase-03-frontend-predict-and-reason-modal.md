# Phase 03 — Frontend: client prediction + required-reason modal

## Context Links
- `frontend/src/app/attendance/hooks/use-checkin-checkout.ts` (handleCheckIn 98, handleCheckOut 130, gpsPayload 75)
- `frontend/src/app/attendance/page.tsx` (wires hook + LocationReasonBox)
- `frontend/src/app/attendance/components/checkout-shift-picker-modal.tsx` (modal pattern reference)
- `frontend/src/services/attendance.service.ts:12-100` (payload types CheckInPayload/CheckOutPayload)
- `backend/src/attendance/helpers/session-hours.ts:54-75` (formula to port)
- `frontend/src/app/attendance/components/today-sessions-list.tsx:10-30` (hhmmToMins helper exists — reuse)

## Overview
Priority P2. Detect late/early BEFORE submit using ported grace semantics; if triggered, open a
modal that blocks submission until a reason is entered, then submit with `lateReason`/`earlyReason`.

## Key Insight
Two separate reason concerns now exist and must not collide:
- `locationNote` (GPS/geofence) — existing `LocationReasonBox`, unchanged.
- `lateReason` / `earlyReason` (this feature) — new modal.
Both can theoretically fire on the same action (outside office AND late). Keep them independent:
location reason handled as today (pre-check via `needsReason`), late/early modal is an additional
gate. Order: run late/early modal gate, on confirm proceed to existing submit path (which already
enforces location reason via `guardReason`).

## Requirements
Functional:
- New util `predictLateEarly.ts` mirroring backend exactly:
  - `predictIsLate(now: Date, shift): boolean` — port lines 54-65 (checkinMin vs startMin+graceLate, cross-day normalize `checkinMin < rawEndMin → +1440`).
  - `predictIsEarlyOut(checkinTime: Date, now: Date, shift): boolean` — port lines 71-75 (workingHours = (now-checkin)ms→h minus breakMinutes/60; normalHours = (endMin-startMin-break)/60; early if workingHours < normalHours - graceEarly/60).
  - Use the same `hhmmToMins` logic as backend `hhmmToMinutes`.
- `handleCheckIn`: before submit, if `predictIsLate(now, shift)` and no lateReason yet → open modal (kind='late'); block. On modal confirm with non-empty reason → call checkIn with `lateReason`.
- `handleCheckOut`: before submit, if `predictIsEarlyOut(session.checkinTime, now, shift)` and no earlyReason → open modal (kind='early'); block. On confirm → checkOut with `earlyReason`.
- Modal: single reason textarea, required (confirm disabled/validation when empty), Cancel aborts the action. Follow `checkout-shift-picker-modal.tsx` / `Modal` UI conventions + i18n keys.
- `gpsPayload` extended to optionally include `lateReason` / `earlyReason`.
- Keep backend-error fallback: if backend still returns a `reason`-containing 400 (clock skew edge), surface it (existing handlers already branch on `reason`) — but prefer opening the new modal so UX is consistent. Minimal: reuse existing inline error path as safety net.

Non-functional: no blocking on employees with no shift/grace data → treat missing shift as "cannot predict" → skip modal (backend guard still catches real late/early). See edge cases.

## Architecture / Data Flow
```
click Check In(shiftId)
  → find MonthlyShift by shiftId (has grace fields from Phase 02)
  → predictIsLate(now, shift)?
       no  → existing submit (locationNote path unchanged)
       yes → setModal({kind:'late', shiftId}) ; wait
              confirm(reason) → checkIn({...payload, lateReason:reason})
click Check Out(shiftId)
  → find open session (has checkinTime) + its shift
  → predictIsEarlyOut(checkinTime, now, shift)?
       yes → modal kind:'early' → checkOut({...payload, earlyReason})
```

## Related Code Files
Create:
- `frontend/src/app/attendance/utils/predict-late-early.ts`
- `frontend/src/app/attendance/components/late-early-reason-modal.tsx`
Modify:
- `frontend/src/app/attendance/hooks/use-checkin-checkout.ts` — add modal state, prediction gate, pass reason to service.
- `frontend/src/app/attendance/page.tsx` — render `<LateEarlyReasonModal>` and pass shift list/session lookup into hook.
- `frontend/src/services/attendance.service.ts` — add `lateReason?`/`earlyReason?` to CheckIn/CheckOut payload types.
- i18n locale files — new keys (e.g. `attendance.lateReasonTitle`, `earlyReasonTitle`, `lateReasonLabel`, `earlyReasonLabel`, `reasonRequired`).

## Implementation Steps
1. Write `predict-late-early.ts`; unit-test parity vs backend cases (Phase 05).
2. Build `LateEarlyReasonModal` (props: open, kind, value, onChange, onConfirm, onCancel, loading, error).
3. In hook: add `reasonModal` state + a `pendingActionRef`. Split submit into "gate" then "execute". Feed shift lookup (from `shifts` MonthlyShift[] + open sessions) into the hook via options.
4. Wire modal in page.tsx.
5. Extend service payload types.
6. Add i18n keys (vi + en).
7. `npx tsc --noEmit` + manual smoke.

## Todo
- [ ] predict util ported + matches backend formula
- [ ] modal component
- [ ] hook prediction gate (late)
- [ ] hook prediction gate (early)
- [ ] reason passed in payload
- [ ] page wiring
- [ ] service payload types
- [ ] i18n keys (vi/en)
- [ ] typecheck

## Success Criteria
- Late check-in: modal appears before any API call; cannot submit empty; submitting sends `lateReason`; row persists it.
- Early check-out: same for `earlyReason`.
- On-time / not-early: no modal, unchanged flow.
- Outside-office + late simultaneously: location reason + late reason both captured without conflict.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Client clock skew → prediction differs from server | Med | Med | Backend guard (Phase 01) is authoritative; hook error path re-surfaces `reason` 400 |
| Prediction formula drifts from backend | Med | High | Port verbatim + parity unit tests (Phase 05); shared constants |
| Employee has no shift assigned → shift undefined | Low | Med | If no matching MonthlyShift → skip prediction (no modal); backend won't compute isLate without shift either |
| Double modal (location + late) confusing | Low | Low | Sequence: late/early modal first, then existing location guard on submit |

## Edge Cases
- No shift assigned: cannot predict → skip modal; backend still safe (no shift → no isLate path triggered in resolver context — verify resolver always returns a shift; if it throws, employee already blocked).
- Cross-day shift: use ported `checkinMin < rawEndMin → +1440` rule (do NOT normalize early arrivals).
- Check-out with `attendanceId` (closing previous-day unclosed session): still fetch that record's `checkinTime` + shift for early prediction; if shift missing skip.
- Multiple open sessions / picker path (`handlePickerSelect`): apply early prediction against the picked session's shift before final checkout.

## Security
- Reason free-text rendered later in admin UI → ensure React default escaping (no `dangerouslySetInnerHTML`). No secrets.

## Next Steps
Phase 04 surfaces stored reasons to admins; Phase 05 tests parity + flows.
</content>
