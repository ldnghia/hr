---
title: "Require reason when check-in late / check-out early"
description: "Pre-submit modal forcing employees to enter a reason when check-in is late or check-out is early beyond shift grace, persisted to dedicated Attendance fields."
status: pending
priority: P2
effort: ~7h
branch: main
tags: [attendance, checkin, checkout, late, early, ux, prisma]
created: 2026-07-18
---

# Late Check-in / Early Check-out — Mandatory Reason

## Goal
When an employee checks in after the shift grace-late window, or checks out before
the shift end minus grace-early window, the frontend must detect it BEFORE calling
the API, show a modal that requires a reason, then submit check-in/check-out together
with that reason. Reason stored in new dedicated `lateReason` / `earlyReason` columns.

## Confirmed Decisions (do not re-litigate)
1. **Timing:** predictive / pre-submit — frontend detects late/early client-side before API call.
2. **Threshold:** mirror backend `computeSessionFlags()` grace semantics (session-hours.ts:43-80). No new threshold.
3. **Storage:** new `lateReason` / `earlyReason` on `Attendance` (aggregate/report copy) AND a new
   `reason` column on `AttendanceLog` (raw immutable per-event history, disambiguated by existing `type`).
   Both kept SEPARATE from existing `note`/`checkinNote`/`checkoutNote`/`locationNote` (GPS/device semantics).
4. **Scope:** both late check-in and early check-out.

## Central Architecture Insight (data-flow gap)
`GET /attendance/my-shifts/current-month` and the frontend `MonthlyShift` type expose only
`{shiftId, shiftName, startTime, endTime, code}`. To mirror `computeSessionFlags` client-side,
the frontend also needs `graceLateMinutes`, `graceEarlyMinutes`, `isCrossDay`, `breakMinutes`.
Phase 02 extends this endpoint + type. Without it, the client cannot compute the same threshold.

## Data Flow (target)
```
Check-in:  [now] + [shift grace] --client predict--> isLate?
             └ yes → modal (required reason) → checkIn({..., lateReason})
             └ no  → checkIn({...})
Check-out: [session.checkinTime] + [now] + [shift] --client predict--> isEarlyOut?
             └ yes → modal (required reason) → checkOut({..., earlyReason})
             └ no  → checkOut({...})
Backend (defense-in-depth): recompute isLate/isEarlyOut server-side; if true and reason
  missing → 400. Persist lateReason/earlyReason on Attendance row AND write reason onto the
  matching AttendanceLog event row (new `reason` column, not `note`).
```

## Phases
| # | File | Status | Depends |
|---|------|--------|---------|
| 01 | [phase-01-backend-schema-dto-service.md](phase-01-backend-schema-dto-service.md) | pending | — |
| 02 | [phase-02-frontend-shift-grace-data.md](phase-02-frontend-shift-grace-data.md) | pending | 01 (endpoint owner) |
| 03 | [phase-03-frontend-predict-and-reason-modal.md](phase-03-frontend-predict-and-reason-modal.md) | pending | 02 |
| 04 | [phase-04-admin-report-surface.md](phase-04-admin-report-surface.md) | pending | 01 |
| 05 | [phase-05-tests.md](phase-05-tests.md) | pending | 01-04 |

## File Ownership (no overlap across parallel work)
- Phase 01: `backend/prisma/schema.prisma` (Attendance + AttendanceLog), migration, `dto/check-in.dto.ts`, `dto/check-out.dto.ts`, `attendance-checkin.service.ts`
- Phase 02: `backend/src/attendance/attendance-query.service.ts` (my-shifts map), `frontend/src/types/index.ts` (MonthlyShift), `frontend/src/app/attendance/hooks/use-current-month-shifts.ts` (if needed)
- Phase 03: new `frontend/.../attendance/utils/predict-late-early.ts`, new `late-early-reason-modal.tsx`, `hooks/use-checkin-checkout.ts`, `page.tsx`, `attendance.service.ts` (payload types)
- Phase 04: `attendance-export-late-early-sheet.ts`, admin detail/report components
- Phase 05: test files only

Phase 02 and 03 both touch frontend but distinct files; 03 depends on 02's type change. Run 01→02→03 sequentially; 04 can run parallel to 02/03.

## Key Risks (see phase files for full matrix)
- Client clock skew → false negative/positive prediction. Mitigated by backend guard (Phase 01).
- Cross-day shift normalization must match backend exactly. Mitigated by porting the same formula + tests.
- Existing rows have NULL reasons — backward compatible (nullable columns, no backfill).
</content>
</invoke>
