# Code Review: Half-Day CC Leave Feature — Prod Deploy Readiness

Scope: uncommitted diff across backend leave/attendance/shift-schedule + frontend attendance/leave modules.

## Critical

1. **Missing Prisma migration for `half_day_session`/`shift_id`** (already confirmed by orchestrator, not re-verified here). `backend/prisma/schema.prisma` adds `LeaveRequest.halfDaySession` and `LeaveRequest.shiftId` but no migration file exists under `backend/prisma/migrations/`. `prisma migrate deploy` will not create these columns — any write/read of `halfDaySession`/`shiftId` will throw against prod DB. **Blocks deploy.**

2. **No ownership/schedule validation on `dto.shiftId` for half-day CC leave.** `backend/src/leave/dto/create-leave-request.dto.ts:36-40` validates `shiftId` is a positive int but nothing checks it belongs to the requesting employee's `EmployeeShiftSchedule` for `fromDate`. `backend/src/leave/leave.service.ts:123` stores it as-is; `backend/src/leave-approval.service.ts` half-day branch (~line 222) later does `attendance.upsert({ where: { employeeId_date_shiftId: { employeeId, date, shiftId: request.shiftId } } })`. A malicious/buggy client can submit any `shiftId` (even another employee's shift or a shift they aren't scheduled on), creating a phantom leave-marked attendance row for a shift they never worked. Add a server-side check: `shiftId` must exist in `EmployeeShiftSchedule` for `(employeeId, fromDate)` before accepting.

## Important

3. **Frontend/backend contract mismatch: admin "Cancel approved leave" button is dead-end.** `frontend/src/app/leave/[id]/page.tsx:33-37` now shows Cancel to `admin` for any employee's `approved` leave (`leave.status === 'approved' && user?.role === 'admin'`). Backend `backend/src/leave/leave.service.ts:210-212` (`cancel()`) throws `ForbiddenException` unless `request.employeeId === employeeId` — there is no admin bypass, and `backend/src/leave/leave.controller.ts:197-205` (`POST :id/cancel`) always passes `@CurrentUser('id')` as the actor. Admin clicking Cancel on someone else's leave will always 403. Either add an admin bypass in `leave.service.ts#cancel`, or revert the frontend condition to owner-only.

4. **`attendance-export-grid.service.ts` half-day-leave detection depends on `r.leaveRequestId` presence but no `deletedAt` filter on the joined `leaveRequest`.** Not itself a soft-delete regression (LeaveRequest has no `deletedAt` in schema), but worth confirming cancelled/rejected leave requests never leave stale `leaveRequestId` pointers on Attendance rows — if a leave is later cancelled after attendance was marked, `leaveHalfDayMap`/`leaveMap` will still report `isHalfDay` from the (now cancelled) LeaveRequest unless `leave-approval.service.ts` clears `leaveRequestId`/`isOnLeave` on cancel. Confirm `cancel()` in `leave.service.ts:226+` clears attendance markers (partially visible in diff context, not fully reviewed — recommend explicit check before deploy).

5. **`leave.service.ts` SHIFT-employee business-day calculation counts all calendar days, no holiday exclusion.** New branch (`leave.service.ts` ~line 80-90) computes `businessDays` for SHIFT employees as raw calendar day count (`toDate - fromDate + 1`), skipping the `calculateBusinessDays` helper entirely (intentional per comment "SHIFT employees work weekends"). Confirm this is also intended to include public holidays as paid leave days — if not, an SHIFT employee leave spanning a holiday will consume one extra leave-balance day compared to FIXED employees on the same holiday.

## Minor

6. **`be-log.txt`** (untracked, 46KB, 282 lines) at repo root — stray debug log, should be deleted and/or added to `.gitignore`, not left in working tree before deploy.

7. **`frontend/src/app/attendance/components/admin-attendance-report.tsx`** — the `annualDays` accumulation logic is dense with 3 near-duplicate leave-branches (future/isOnLeave/isShift/else) each re-deriving `status` from `lt` and incrementing `annualDays`. No functional bug found (verified the half-day-worked branch at line 268/271 does not double count in the common path since `deriveCellStatus` won't return `'annual'` for a non-leave record), but this duplication is a maintenance risk — consider extracting a `resolveLeaveStatus(type, isHalfDay)` helper in a follow-up.

8. **`shift-schedule.controller.ts` new `GET /shift-schedules/me/date`** — correctly scoped to `@CurrentUser('id')`, route registered before `me` and bare `Get()`, no ordering conflict. No action needed.

## Verified Clean

- RBAC on `leave.controller.ts` approve/reject unchanged (not touched by diff besides removing unused imports).
- `shift-schedule.controller.ts`/`service.ts` new endpoint has no IDOR (self-scoped only).
- `attendance-query.service.ts` new `leaveRequests` block correctly ANDs `employeeId`/`departmentId`/`workingMode` narrowing with the existing manager `OR` scope (Prisma top-level keys are ANDed) — no RBAC bypass despite mixing `OR` and direct-key assignment in the same `leaveWhere` object.
- No deletedAt-filter regression found in the attendance-export/query diffs relative to prior fixes (soft-delete filters untouched, still present in base `where.AND`).
- No console.log/debugger/TODO left in the reviewed diff hunks.

## Unresolved Questions

- Does `leave.service.ts#cancel` (lines beyond what was diffed) actually clear `leaveRequestId`/`isOnLeave` on the associated Attendance rows when an approved leave is cancelled? Not in this diff — recommend a quick grep before deploy given item 4 above depends on it.
- Is holiday-inclusive leave-day counting for SHIFT employees (item 5) an intentional business decision, or should holidays still be excluded from `businessDays` count?
