# Phase 02 — Backend API

## Context Links
- Template module: `backend/src/leave/` (controller, service, approval-service patterns)
- Config module: `backend/src/system-config/system-config.service.ts`
- Attendance module: `backend/src/attendance/attendance.service.ts`, `attendance-processor.service.ts`
- Schema: phase-01

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** Implement REST endpoints for correction request lifecycle + admin direct edit. Enforce monthly limit via system-config. 1-step approval (HR/Admin).

## Key Insights
- Use service-layer pattern; controller only validates DTOs and calls service.
- Monthly limit counts requests where `status IN ('pending','approved')` in current calendar month.
- "One active correction per attendance" = no existing request with status `pending` or `approved` for that `attendanceId`.
- On approve: snapshot already captured at submit → service applies `requestedX ?? attendance.X` to attendance row, sets `isCorrected=true`, `correctionRequestId=req.id`, recomputes `workingHours/isLate/isEarlyOut` via processor.
- Admin direct-edit creates a synthetic correction request with `status=approved`, `reviewedBy=admin`, so audit trail is uniform.

## Requirements

### Functional
1. `POST /attendance-correction` — employee creates request.
2. `GET /attendance-correction` — list (RBAC: admin/hr → all; employee → own). Query: `status`, `employeeId`, `from`, `to`, `page`, `limit`.
3. `GET /attendance-correction/:id` — detail (own or admin/hr).
4. `POST /attendance-correction/:id/approve` — HR/Admin only. Body: `{ reviewNote? }`.
5. `POST /attendance-correction/:id/reject` — HR/Admin only. Body: `{ reviewNote }` (required).
6. `POST /attendance-correction/:id/cancel` — owner only, while pending.
7. `PATCH /attendance/:id/admin-edit` — Admin only. Body: subset of correctable fields + `reason`.

### Non-Functional
- Response format: `{ data, message, statusCode }`.
- DTO validation via `class-validator`.
- All endpoints behind `JwtAuthGuard` + `RolesGuard`.

## Architecture

### Module layout
```
backend/src/attendance-correction/
├── attendance-correction.module.ts
├── attendance-correction.controller.ts        (~150 LOC)
├── attendance-correction.service.ts           (~180 LOC, split if grows)
├── attendance-correction-limit.service.ts     (monthly limit checker, ~60 LOC)
├── dto/
│   ├── create-correction.dto.ts
│   ├── review-correction.dto.ts
│   ├── admin-edit-attendance.dto.ts
│   └── list-correction.query.dto.ts
└── attendance-correction.constants.ts         (status enum, config keys)
```

### Data flow — Submit
```
Employee → POST /attendance-correction
  → ctrl validates DTO
  → service.create():
      tx:
        1. load attendance (must own)
        2. ensure no active correction for attendance
        3. limit-service.assertWithinMonthlyLimit(employeeId)
        4. snapshot original* fields from attendance
        5. create row status=pending
  → return { data: request }
```

### Data flow — Approve
```
HR → POST /:id/approve
  → ctrl (RolesGuard: admin|hr)
  → service.approve():
      tx:
        1. load request (must be pending)
        2. apply requested* (?? original*) to attendance row
        3. set attendance.isCorrected=true, correctionRequestId=req.id
        4. processor.recompute(attendance)
        5. update request: status=approved, reviewedBy, reviewedAt, reviewNote
        6. write AuditLog
```

### Data flow — Admin direct edit
```
Admin → PATCH /attendance/:id/admin-edit
  → service.adminEdit():
      tx:
        1. load attendance
        2. snapshot originals into a new correction request created with status=approved
        3. apply requested fields, recompute, isCorrected=true, correctionRequestId
        4. AuditLog
```

### Monthly Limit
- Key: `attendance_correction_monthly_limit` (string → int, default `"3"`).
- `LimitService.getLimit()` reads via `SystemConfigService`; cache in-memory 60s.
- `assertWithinMonthlyLimit(employeeId)` counts requests for `employeeId` where `createdAt` in `[startOfMonth, endOfMonth]` AND `status IN ('pending','approved')`. Throws `BadRequestException` if `>= limit`.

## Related Code Files

**Create**
- `backend/src/attendance-correction/attendance-correction.module.ts`
- `backend/src/attendance-correction/attendance-correction.controller.ts`
- `backend/src/attendance-correction/attendance-correction.service.ts`
- `backend/src/attendance-correction/attendance-correction-limit.service.ts`
- `backend/src/attendance-correction/attendance-correction.constants.ts`
- `backend/src/attendance-correction/dto/create-correction.dto.ts`
- `backend/src/attendance-correction/dto/review-correction.dto.ts`
- `backend/src/attendance-correction/dto/admin-edit-attendance.dto.ts`
- `backend/src/attendance-correction/dto/list-correction.query.dto.ts`

**Modify**
- `backend/src/app.module.ts` — register module
- `backend/src/attendance/attendance.module.ts` — export `AttendanceProcessorService` if not already
- `backend/prisma/seed.ts` — seed `attendance_correction_monthly_limit=3` (idempotent)

**Read for context**
- `backend/src/leave/leave.controller.ts`, `leave.service.ts` (response shape, RBAC)
- `backend/src/system-config/system-config.service.ts` (key read pattern)
- `backend/src/attendance/attendance-processor.service.ts` (recompute API)

## Implementation Steps
1. Create module skeleton and register in `app.module.ts`.
2. Implement DTOs with `class-validator` decorators (`@IsOptional`, `@IsDateString`, `@IsInt`, `@IsString`, `MaxLength`).
3. Implement `LimitService` with in-memory cache keyed by config key.
4. Implement `Service.create()` with tx + monthly-limit check + active-correction check + snapshot.
5. Implement `Service.approve()` with tx; reuse `AttendanceProcessorService.recompute()`.
6. Implement `Service.reject()` and `Service.cancel()`.
7. Implement `Service.adminEdit()` (creates auto-approved correction).
8. Implement `Service.list()` with RBAC scoping and pagination.
9. Wire controller endpoints + Swagger decorators.
10. Add seed entry for config key.
11. Compile: `cd backend && npx tsc --noEmit`.
12. Manual smoke test via Swagger: create → approve flow updates attendance.

## Todo
- [ ] Module + folder scaffold
- [ ] DTOs with validation
- [ ] Constants (status enum, config key)
- [ ] LimitService
- [ ] Service: create
- [ ] Service: approve (recompute integration)
- [ ] Service: reject
- [ ] Service: cancel
- [ ] Service: adminEdit
- [ ] Service: list with RBAC scope
- [ ] Controller endpoints + guards + Swagger
- [ ] Register in app.module.ts
- [ ] Seed default config
- [ ] Compile check
- [ ] Smoke-test full flow

## Success Criteria
- All endpoints return `{ data, message, statusCode }`.
- Submitting a 4th request in same month → HTTP 400 with clear message.
- Submitting against attendance that already has pending/approved request → HTTP 400.
- Approving updates attendance and sets `isCorrected=true`; subsequent `GET /attendance/:id` shows updated values.
- Employee cannot view another employee's request (HTTP 403).
- Rejecting requires `reviewNote`.
- Admin direct edit creates a paired `AttendanceCorrectionRequest` with `status=approved`.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Concurrent submits bypass limit | Low | Med | Tx + recount inside |
| Recompute fails after partial update | Low | High | All updates inside `prisma.$transaction` |
| Stale config cache shows wrong limit | Low | Low | 60s TTL; invalidate on system-config update if hook exists |
| Reviewer is the requester | Med | Low | Reject in service: `if reviewedBy === employeeId throw` for non-admins |

## Security
- All endpoints `@UseGuards(JwtAuthGuard, RolesGuard)`.
- `@Roles('admin','hr')` on review/admin-edit endpoints.
- Service double-checks ownership in `getById`/`cancel`/`list`.
- Reason and reviewNote length-capped (e.g., 1000 chars) to prevent abuse.

## Next Steps
Phase 03 (frontend).
