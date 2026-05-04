---
title: "Attendance Correction Request"
description: "Employees can submit attendance correction requests; HR/Admin approve, with monthly limit and audit trail."
status: complete
priority: P2
effort: 12h
branch: main
tags: [attendance, workflow, hr, backend, frontend]
created: 2026-04-29
---

# Attendance Correction Request — Implementation Plan

## Goal
Enable employees to request corrections (check-in/out time, note, shift) on attendance records, subject to a configurable monthly limit. HR/Admin approve via 1-step workflow. Admin can also directly edit records. Preserve audit trail; mark corrected records.

## Phases

| # | Phase | File | Status | Effort |
|---|-------|------|--------|--------|
| 01 | Database Schema (Prisma) | [phase-01-database-schema.md](./phase-01-database-schema.md) | complete | 1h |
| 02 | Backend API (NestJS) | [phase-02-backend-api.md](./phase-02-backend-api.md) | complete | 6h |
| 03 | Frontend UI (Next.js) | [phase-03-frontend-ui.md](./phase-03-frontend-ui.md) | complete | 5h |

## Key Dependencies
- Phase 02 depends on Phase 01 (Prisma migration applied + client regenerated).
- Phase 03 depends on Phase 02 (API contracts available).
- `system-config` module reused for `attendance_correction_monthly_limit` (default 3).
- Leave module patterns reused for approval workflow shape.

## Success Criteria
- Employee can submit, view, cancel own pending correction requests.
- Monthly limit enforced server-side (countable from approved + pending in current month).
- HR/Admin approval updates the attendance record and sets `isCorrected=true`.
- Admin direct-edit endpoint also flips `isCorrected=true` and writes original snapshot.
- Only one non-rejected correction per attendance record at a time.
- All mutations covered by existing AuditLog hook (or explicit log entry).

## Rollback Strategy
- Phase 01: revertable via Prisma migration (drop new table + drop new columns). Existing attendance rows untouched.
- Phase 02: feature-flag-free; remove module import from `app.module.ts` to disable endpoints.
- Phase 03: hide UI entry points behind feature toggle if rollback needed.

## Risk Summary
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Race on monthly-limit (concurrent submits) | Low | Medium | Wrap count+create in Prisma `$transaction` w/ serializable isolation OR unique partial index `(employeeId, yearMonth, n)` skipped — use tx + recount inside |
| Attendance record mutated by sync after approval | Low | High | Approve uses tx; recompute `workingHours/isLate/isEarlyOut` via existing processor service |
| Original values lost on approval | Med | High | Snapshot original fields into correction request `originalCheckinTime`, etc. before updating |
| Monthly-limit config missing | Low | Low | Service returns default 3 when key absent |

## Unresolved Questions
- Should employee be allowed to **cancel** own pending request? (assume yes — included)
- Are correction requests scoped per-attendance or per-day if no attendance row exists yet? (assume requires existing attendance row; reject otherwise)
- Should HR be auto-notified (Telegram)? (out of scope unless requested)
