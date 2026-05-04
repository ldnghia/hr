# Phase 01 — Database Schema

## Context Links
- Schema: `F:\AI\hr_project\backend\prisma\schema.prisma`
- Models referenced: `Attendance` (line 297), `Shift`, `Employee`, `LeaveRequest` (pattern)

## Overview
- **Priority:** P1 (blocks Phase 02)
- **Status:** pending
- **Description:** Add `AttendanceCorrectionRequest` model + extend `Attendance` with `isCorrected` flag and `correctionRequestId` FK to last approved correction.

## Key Insights
- Existing `Attendance` already has unique `(employeeId, date)` — correction request linked by `attendanceId` FK.
- Original values must be snapshot in the request itself (audit trail) — do **not** rely on history table.
- Status string follows `LeaveRequest` convention: `"pending" | "approved" | "rejected" | "cancelled"`.

## Requirements

### Functional
- Track who requested, what changes, who reviewed, when, and why.
- Preserve original attendance values at submission time.
- Allow nullable fields — request may correct only some fields.

### Non-Functional
- Indexed by `employeeId + createdAt` (monthly-limit query).
- Indexed by `attendanceId + status` (one-active-per-attendance check).

## Architecture

```
Employee 1───* AttendanceCorrectionRequest *───1 Attendance
                                          *───1 Shift (requested)
                                          *───1 Employee (reviewer)
```

### Schema additions

```prisma
model AttendanceCorrectionRequest {
  id                       Int       @id @default(autoincrement())
  employeeId               Int       @map("employee_id")
  attendanceId             Int       @map("attendance_id")

  // Requested values (nullable = no change for that field)
  requestedCheckinTime     DateTime? @map("requested_checkin_time")
  requestedCheckoutTime    DateTime? @map("requested_checkout_time")
  requestedCheckinNote     String?   @map("requested_checkin_note")
  requestedCheckoutNote    String?   @map("requested_checkout_note")
  requestedShiftId         Int?      @map("requested_shift_id")

  // Original snapshot (frozen at submission)
  originalCheckinTime      DateTime? @map("original_checkin_time")
  originalCheckoutTime     DateTime? @map("original_checkout_time")
  originalCheckinNote      String?   @map("original_checkin_note")
  originalCheckoutNote     String?   @map("original_checkout_note")
  originalShiftId          Int?      @map("original_shift_id")

  reason                   String
  status                   String    @default("pending") // pending|approved|rejected|cancelled
  reviewedBy               Int?      @map("reviewed_by")
  reviewedAt               DateTime? @map("reviewed_at")
  reviewNote               String?   @map("review_note")

  createdAt                DateTime  @default(now()) @map("created_at")
  updatedAt                DateTime  @updatedAt      @map("updated_at")

  employee                 Employee  @relation("CorrectionRequester", fields: [employeeId], references: [id])
  reviewer                 Employee? @relation("CorrectionReviewer",  fields: [reviewedBy], references: [id])
  attendance               Attendance @relation(fields: [attendanceId], references: [id])
  requestedShift           Shift?    @relation("CorrectionRequestedShift", fields: [requestedShiftId], references: [id])

  @@index([employeeId, createdAt])
  @@index([attendanceId, status])
  @@map("attendance_correction_request")
}
```

### Attendance model additions
```prisma
isCorrected            Boolean  @default(false) @map("is_corrected")
correctionRequestId    Int?     @unique @map("correction_request_id")
corrections            AttendanceCorrectionRequest[]
```

### Employee model additions (back-relations)
```prisma
correctionRequests     AttendanceCorrectionRequest[] @relation("CorrectionRequester")
correctionReviews      AttendanceCorrectionRequest[] @relation("CorrectionReviewer")
```

### Shift model additions (back-relations)
```prisma
correctionRequests     AttendanceCorrectionRequest[] @relation("CorrectionRequestedShift")
```

## Related Code Files
**Modify**
- `backend/prisma/schema.prisma`

**Create**
- `backend/prisma/migrations/<timestamp>_attendance_correction_request/migration.sql` (auto-generated)

## Implementation Steps
1. Edit `schema.prisma`: add new model + relation back-refs on `Attendance`, `Employee`, `Shift`.
2. Run `npx prisma migrate dev --name attendance_correction_request`.
3. Verify migration SQL — confirm no destructive changes to existing `attendance` data.
4. Run `npx prisma generate`.
5. Smoke-test: open Prisma Studio, confirm new table renders.

## Todo
- [ ] Add `AttendanceCorrectionRequest` model
- [ ] Add `isCorrected`, `correctionRequestId` to `Attendance`
- [ ] Add back-relations on `Employee`, `Shift`
- [ ] Generate + apply migration
- [ ] Run `prisma generate`
- [ ] Verify schema compiles (`npx tsc --noEmit` in backend)

## Success Criteria
- Migration applies on a fresh DB and on the current dev DB without data loss.
- `prisma generate` produces typed client with `attendanceCorrectionRequest` delegate.
- Existing attendance queries unaffected (run backend `npm run start:dev` and hit `/attendance`).

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Forgotten back-relations cause Prisma validation error | Run `npx prisma validate` before migrate |
| Migration deploy in prod fails on FK | Add migration in two steps if needed (column nullable first) — N/A here since FK is nullable |

## Security
- No new auth surface yet; data isolation enforced in service layer (Phase 02).

## Next Steps
Proceed to Phase 02.
