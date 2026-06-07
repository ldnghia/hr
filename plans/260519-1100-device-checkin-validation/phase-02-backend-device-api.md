# Phase 02 — Backend Device API + Check-in Validation

## Context
- Check-in service: `backend/src/attendance/attendance-checkin.service.ts:21-197`
- Check-out service: same file, line 201
- DTOs: `backend/src/attendance/dto/check-in.dto.ts`, `check-out.dto.ts` (already have `deviceId`)
- Module: `backend/src/attendance/attendance.module.ts`
- Depends on: Phase 01

## Overview
- Priority: P0
- Status: pending
- Create `DeviceModule` (CRUD + service), inject device validation into check-in / check-out.

## Requirements

### Functional
1. CRUD endpoints for device registration.
2. Employee self-register own device; admin/HR register/deactivate any device.
3. Check-in guard runs **after GPS validation, before upsert**.
4. STRICT mode → 403 with i18n message; WARN mode → write `isUnknownDevice=true`, append to `checkinNote`.
5. Update `lastUsedAt` on successful check-in from registered device.
6. Enforce max devices per employee (env `DEVICE_MAX_PER_EMPLOYEE`, default 3).

### Non-functional
- File size <200 lines per file.
- Guard logic isolated in `device-validation.service.ts` — keep checkin service slim.
- Config via env: `DEVICE_VALIDATION_MODE` = `STRICT` | `WARN` | `DISABLED` (default `DISABLED` for safe rollout).

## Architecture

### Files to CREATE
```
backend/src/device/
├── device.module.ts
├── device.controller.ts          # REST endpoints
├── device.service.ts             # CRUD + business logic
├── device-validation.service.ts  # used by attendance
└── dto/
    ├── register-device.dto.ts
    ├── update-device.dto.ts
    └── list-devices-query.dto.ts
```

### Files to MODIFY
- `backend/src/attendance/attendance-checkin.service.ts` — inject `DeviceValidationService`, call between step 7 (location guard) and step 8 (late flag); apply same on checkout (line 290 area).
- `backend/src/attendance/attendance.module.ts` — import `DeviceModule`.
- `backend/src/app.module.ts` — register `DeviceModule`.

## Data Flow

```
POST /attendance/checkin { deviceId, lat, lng, ... }
  └─► AttendanceCheckinService.checkIn()
        ├─► GPS validation (existing)
        ├─► DeviceValidationService.validate(employeeId, deviceId)
        │     ├─ mode=DISABLED → return { ok: true }
        │     ├─ no deviceId → STRICT throw / WARN return { unknown: true }
        │     ├─ lookup RegisteredDevice (employeeId, fingerprint, isActive)
        │     ├─ found → update lastUsedAt → return { ok: true }
        │     └─ not found → STRICT throw 403 / WARN return { unknown: true }
        ├─► Upsert attendance (add isUnknownDevice flag if WARN-unknown)
        └─► AttendanceLog.create (existing — already stores deviceId)
```

## API Endpoints

| Method | Path | Role | Body / Query | Purpose |
|---|---|---|---|---|
| POST | `/devices/register` | employee | `{ deviceFingerprint, deviceName?, userAgent? }` | Self-register current device |
| GET | `/devices/me` | employee | — | List own devices |
| DELETE | `/devices/me/:id` | employee | — | Soft-deactivate own device |
| GET | `/devices` | admin, hr | `?employeeId=&isActive=` | List all (paginated) |
| POST | `/devices` | admin, hr | `{ employeeId, deviceFingerprint, deviceName }` | Register for any employee |
| PATCH | `/devices/:id` | admin, hr | `{ isActive?, deviceName? }` | Toggle active / rename |
| DELETE | `/devices/:id` | admin, hr | — | Soft-deactivate |

Response format: `{ data, message, statusCode }` per project convention.

## Validation Logic (device-validation.service.ts)
```ts
async validateForCheckIn(employeeId: number, deviceId?: string): Promise<{ unknown: boolean }> {
  const mode = process.env.DEVICE_VALIDATION_MODE ?? 'DISABLED';
  if (mode === 'DISABLED') return { unknown: false };
  if (!deviceId) {
    if (mode === 'STRICT') throw new ForbiddenException('Thiết bị chưa được đăng ký');
    return { unknown: true };
  }
  const device = await this.prisma.registeredDevice.findFirst({
    where: { employeeId, deviceFingerprint: deviceId, isActive: true },
  });
  if (!device) {
    if (mode === 'STRICT') throw new ForbiddenException('Thiết bị chưa được đăng ký');
    return { unknown: true };
  }
  await this.prisma.registeredDevice.update({
    where: { id: device.id },
    data: { lastUsedAt: new Date() },
  });
  return { unknown: false };
}
```

## Insertion Point in `attendance-checkin.service.ts`
After line 132 (location guard passes), before line 138 (late flag):
```ts
// 7b. Device validation
const { unknown: isUnknownDevice } = await this.deviceValidation.validateForCheckIn(employeeId, dto.deviceId);
```
Then pass `isUnknownDevice` into the upsert `create` and `update` blocks. If unknown, prefix `checkinNote` with `[UNKNOWN DEVICE] `.

Apply same pattern to `checkOut` (line 201) — but use a separate `validateForCheckOut` that does NOT throw (employees may have lost original device by checkout time; log only).

## Todo
- [ ] Create `DeviceModule` skeleton (module + controller + service)
- [ ] DTOs with class-validator
- [ ] CRUD endpoints + RBAC guards (`@Roles('admin','hr')`)
- [ ] `DeviceValidationService` with mode switch
- [ ] Wire into `AttendanceCheckinService` (checkin + checkout)
- [ ] Add `DEVICE_VALIDATION_MODE`, `DEVICE_MAX_PER_EMPLOYEE` to `.env.example`
- [ ] Unit tests: validation service (3 modes × 2 deviceId states)
- [ ] e2e test: registered device → 200; unregistered + STRICT → 403; unregistered + WARN → 200 with flag

## Success Criteria
- All endpoints return `{ data, message, statusCode }`.
- `npm run build` passes.
- Swagger UI shows new `/devices` group.
- Existing attendance tests still pass.
- New test: WARN-mode unregistered check-in stores `isUnknownDevice=true`.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Existing employees can't check in (STRICT, no registered devices) | High if STRICT default | High | Default mode `DISABLED`; deploy `WARN` first; switch `STRICT` after grace period |
| Validation adds latency to hot path | Med | Low | Single indexed lookup; <5ms expected |
| Frontend doesn't send deviceId yet | High | — | Phase 03 ships fingerprint; meanwhile mode stays `DISABLED` or `WARN` |
| Device fingerprint changes (browser update) → user locked out | Med | Med | WARN mode tolerates; self-register flow easy |

## Rollback
- Set `DEVICE_VALIDATION_MODE=DISABLED` — validation short-circuits.
- API endpoints harmless if unused.
- Revert via `git revert <commit>` — schema migration stays (additive).

## Security Considerations
- RBAC: only `admin`/`hr` can register/modify devices for other employees.
- Employee self-register limited to own `employeeId` (derived from JWT, never from body).
- Rate-limit `/devices/register` (3 req/min) to prevent fingerprint enumeration.
- Log all device registrations to `AuditLog` (existing pattern).

## Next Steps
Unblocks Phases 03 + 04 (parallelizable).
