# Phase 02 — Expose shift grace fields to frontend

## Context Links
- `backend/src/attendance/attendance-query.service.ts:287-337` (3 map sites for my-shifts response)
- `backend/src/attendance/attendance.controller.ts:163-171` (endpoint)
- `frontend/src/types/index.ts:423-428` (MonthlyShift)
- `frontend/src/app/attendance/hooks/use-current-month-shifts.ts`

## Overview
Priority P2. The client cannot mirror `computeSessionFlags` without grace + cross-day + break
fields. This phase adds them to the `my-shifts/current-month` payload and the `MonthlyShift` type.

## Key Insight
`getMyShiftsCurrentMonth` maps shift → `{shiftId, shiftName, startTime, endTime, code}` in THREE
branches (deptShifts, assignments, defaultShift fallback). All three must add the new fields to
stay consistent.

## Requirements
- Payload items add: `graceLateMinutes`, `graceEarlyMinutes`, `isCrossDay`, `breakMinutes`.
- Prisma selects for those branches must include these columns (check each `select`/`include`; Shift already has them — ensure not narrowed by a `select`).
- `MonthlyShift` type extended with the 4 fields.

## Related Code Files
Modify:
- `backend/src/attendance/attendance-query.service.ts` — 3 map objects (lines ~287, ~309, ~331) + ensure the queries select grace/isCrossDay/breakMinutes (add to `select` if present; if using full record, fine).
- `frontend/src/types/index.ts` — `MonthlyShift` add `graceLateMinutes: number; graceEarlyMinutes: number; isCrossDay: boolean; breakMinutes: number;`
- `backend/src/attendance/attendance.controller.ts:168` — update Swagger `@ApiResponse` description (cosmetic).

## Implementation Steps
1. Inspect the three query blocks in attendance-query.service.ts; confirm whether each uses `select` (must add fields) or returns full shift (already has). Add `graceLateMinutes, graceEarlyMinutes, isCrossDay, breakMinutes` to each select and each mapped object.
2. Extend `MonthlyShift` interface.
3. Compile backend + frontend typecheck (`cd frontend && npx tsc --noEmit`).

## Todo
- [ ] deptShifts branch mapped
- [ ] assignments branch mapped
- [ ] defaultShift branch mapped
- [ ] Prisma selects include grace/isCrossDay/break
- [ ] MonthlyShift type extended
- [ ] typecheck passes

## Success Criteria
- `GET /attendance/my-shifts/current-month` returns items each containing the 4 new numeric/boolean fields with correct values from the Shift table.
- No existing consumer breaks (fields are additive).

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| One of the 3 branches missed → undefined grace on some employees | Med | High (wrong prediction) | Checklist enforces all three; Phase 05 test hits each branch |
| A `select` omits new column → undefined at runtime | Med | High | Explicitly add to every select |

## Security
No new data exposure of concern (grace/shift config is non-sensitive, already visible on working-shifts page).

## Next Steps
Phase 03 consumes `MonthlyShift` grace fields for client prediction.
</content>
