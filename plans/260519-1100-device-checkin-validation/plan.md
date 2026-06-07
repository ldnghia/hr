---
title: "Device Registration Validation for Attendance Check-in"
description: "Validate registered devices on check-in/out — block or warn for unregistered devices."
status: complete
priority: P2
effort: 12h
branch: main
tags: [attendance, security, device, backend, frontend]
created: 2026-05-19
---

# Device Registration Validation — Attendance Check-in/out

## Goal
Prevent fraudulent check-ins from unauthorized devices. Each employee registers their device(s); attendance system validates `deviceFingerprint` on every check-in/out. Two modes: `STRICT` (block) and `WARN` (allow + flag).

## Phases

| # | Phase | Status | Owner Files | Effort |
|---|---|---|---|---|
| 01 | [Database Schema](./phase-01-database-schema.md) | complete | `backend/prisma/schema.prisma`, migration | 1.5h |
| 02 | [Backend Device API + Validation](./phase-02-backend-device-api.md) | complete | `backend/src/device/*`, `attendance-checkin.service.ts` | 4h |
| 03 | [Frontend Fingerprint + Check-in](./phase-03-frontend-fingerprint-checkin.md) | complete | `frontend/src/lib/device-fingerprint.ts`, `use-checkin-checkout.ts`, `attendance.service.ts` | 2.5h |
| 04 | [Frontend Device Management UI](./phase-04-frontend-device-management-ui.md) | complete | `frontend/src/app/devices/*`, admin panel under `frontend/src/app/admin/devices/*` | 4h |

## Dependency Graph
```
Phase 01 (schema) ──► Phase 02 (backend) ──► Phase 03 (FE checkin)
                              └────────────► Phase 04 (FE mgmt UI)
```
Phase 03 and 04 can run in parallel after Phase 02 lands.

## Global Risks
- Browser fingerprints not stable across browser updates / private mode → mitigation: allow employees to re-register; admin override.
- Existing employees have zero registered devices → mitigation: ship in `WARN` mode first, switch to `STRICT` after grace period (1 week).
- Fingerprint collisions across employees → low risk; unique constraint scoped to `(employeeId, deviceFingerprint)` not global.

## Rollback Strategy
- Set `DEVICE_VALIDATION_MODE=DISABLED` env var → guard short-circuits, behaviour identical to today.
- Migration is additive only (new table + 1 nullable column on `attendance`); safe to leave in place on rollback.

## Success Criteria
- Employee can self-register current device from `/devices` page.
- Admin/HR can list, deactivate, re-register devices for any employee.
- Check-in from unregistered device: STRICT mode → 403; WARN mode → success with `isUnknownDevice=true`.
- `lastUsedAt` updates on each successful check-in.
- All existing attendance flows (GPS, geofence, late detection) unchanged.

## Decisions (confirmed)
- Validation mode: **per-employee** setting, default = `STRICT` (bắt buộc đăng ký thiết bị).
- Max devices per employee: **2**.
- Telegram notification: **không** (v1 — log only).
