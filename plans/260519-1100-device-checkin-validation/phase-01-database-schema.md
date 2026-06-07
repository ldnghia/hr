# Phase 01 — Database Schema

## Context
- Schema: `backend/prisma/schema.prisma`
- Existing models: `Employee` (id 60–108), `Attendance` (312), `AttendanceLog` (294)

## Overview
- Priority: P0 blocker for all later phases
- Status: pending
- Add `RegisteredDevice` model + nullable `isUnknownDevice` flag on `Attendance`.

## Requirements

### Functional
- Track registered devices per employee with fingerprint uniqueness per employee.
- Audit registration source (`registeredBy` userId — admin/HR or self).
- Soft-disable via `isActive` (never hard delete — preserve history).
- Track usage via `lastUsedAt`.

### Non-functional
- Additive migration only (no destructive changes).
- Index `(employeeId, isActive)` for hot check-in lookups.

## Schema Changes

### New model `RegisteredDevice`
```prisma
model RegisteredDevice {
  id                Int       @id @default(autoincrement())
  employeeId        Int       @map("employee_id")
  deviceFingerprint String    @map("device_fingerprint")
  deviceName        String?   @map("device_name")
  userAgent         String?   @map("user_agent")
  isActive          Boolean   @default(true) @map("is_active")
  registeredAt      DateTime  @default(now()) @map("registered_at")
  registeredById    Int?      @map("registered_by_id")
  lastUsedAt        DateTime? @map("last_used_at")
  employee          Employee  @relation("EmployeeToDevices", fields: [employeeId], references: [id])
  registeredBy      Employee? @relation("DeviceRegisteredBy", fields: [registeredById], references: [id])

  @@unique([employeeId, deviceFingerprint], name: "employee_device_unique")
  @@index([employeeId, isActive])
  @@map("registered_device")
}
```

### Employee relations to add
```prisma
registeredDevices       RegisteredDevice[] @relation("EmployeeToDevices")
registeredDevicesByMe   RegisteredDevice[] @relation("DeviceRegisteredBy")
```

### Attendance — add nullable flag
```prisma
isUnknownDevice  Boolean  @default(false) @map("is_unknown_device")
```

## Migration Steps
1. Edit `backend/prisma/schema.prisma` — add model, relations, flag.
2. `cd backend && npx prisma migrate dev --name add_registered_device`
3. Verify: `npx prisma studio` → table appears.
4. Regenerate client: `npx prisma generate` (auto on migrate dev).

## Todo
- [ ] Add `RegisteredDevice` model
- [ ] Add Employee relations
- [ ] Add `Attendance.isUnknownDevice` field
- [ ] Run migration locally
- [ ] Commit migration files

## Success Criteria
- `npx prisma migrate status` shows migration applied.
- `psql -c "\d registered_device"` shows expected columns + unique constraint.
- TypeScript compile succeeds; `prisma.registeredDevice` available.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration fails on prod (existing data) | Low | Med | Additive only — no NOT NULL on existing rows; defaults provided |
| Naming collision with future device features | Low | Low | Prefix `registered_` chosen for clarity |

## Rollback
- `npx prisma migrate resolve --rolled-back <name>` + manual `DROP TABLE registered_device; ALTER TABLE attendance DROP COLUMN is_unknown_device;`
- Safe: no FK references from existing tables to new ones.

## Next Steps
Unblocks Phase 02.
