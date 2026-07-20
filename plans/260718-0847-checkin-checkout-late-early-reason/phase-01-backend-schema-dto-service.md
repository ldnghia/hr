# Phase 01 — Backend: schema, DTO, service guard

## Context Links
- Report: `plans/reports/explore-260718-0845-checkin-checkout-late-early-reason-report.md`
- `backend/prisma/schema.prisma:322-361` (Attendance model)
- `backend/prisma/schema.prisma:301-320` (AttendanceLog model — raw per-event immutable log)
- `backend/src/attendance/dto/check-in.dto.ts`, `dto/check-out.dto.ts`
- `backend/src/attendance/attendance-checkin.service.ts` (checkIn 23-224, checkOut 228-400)
- `backend/src/attendance/helpers/session-hours.ts:43-80` (computeSessionFlags)

## Overview
Priority P2. Status pending. Add dedicated reason columns to BOTH `Attendance` (aggregate/
report-facing) and `AttendanceLog` (raw immutable per-event history), accept reasons in DTOs,
persist them, and add a defense-in-depth server guard that requires the reason when the
server-computed flag is true.

## AttendanceLog reason — design decision
`AttendanceLog` is one row per event; `type` already disambiguates `check_in` vs `check_out`
(service lines 199, 379). Therefore a SINGLE `reason String?` column on AttendanceLog is cleaner
than two — a late event lives on a check_in row, an early event on a check_out row; `type` tells
which. **Keep `reason` SEPARATE from the existing `note` column** (line 316), which carries
GPS/geofence/device semantics (`locationNote`). Do NOT overload `note` — separate columns keep
report/query filters unambiguous (e.g. "rows with a lateness reason" = `type='check_in' AND reason IS NOT NULL`).
Rationale honors backend/CLAUDE.md "Never overwrite data — Always store history": the log row is
the permanent record of the reason at that exact action; `Attendance.lateReason/earlyReason` is
the mutable aggregate copy usable by reports/exports.

## Requirements
Functional:
- `Attendance.lateReason String?`, `Attendance.earlyReason String?` (nullable, snake_case map).
- `AttendanceLog.reason String?` (nullable, snake_case `@map("reason")`), separate from existing `note`.
- `CheckInDto.lateReason?: string`, `CheckOutDto.earlyReason?: string` (optional, `@IsString`, trimmed).
- checkIn: after `computeSessionFlags(ts,null,shift)` → if `isLate && !lateReason.trim()` throw `BadRequestException` with a message containing the word `reason` (frontend already special-cases `reason` in `use-checkin-checkout.ts:120,149` to surface it inline). Persist `lateReason` on the Attendance create/restore AND `reason: lateReason` on the check_in AttendanceLog row.
- checkOut: after `computeSessionFlags(checkinTime,ts,shift)` → if `isEarlyOut && !earlyReason.trim()` throw. Persist `earlyReason` on Attendance update AND `reason: earlyReason` on the check_out AttendanceLog row.
Non-functional: keep API response shape unchanged; nullable → backward compatible.

## Architecture / Data Flow
DTO reason → service → (validate against recomputed flag) → prisma create/update.
Guard is defense-in-depth only; primary UX gate is client-side (Phase 03). Server recompute
is authoritative because client clock can be skewed/bypassed.

## Related Code Files
Modify:
- `backend/prisma/schema.prisma` (add 2 fields to Attendance ~after line 347; add `reason String? @map("reason")` to AttendanceLog ~after line 316).
- `backend/src/attendance/dto/check-in.dto.ts` (add lateReason).
- `backend/src/attendance/dto/check-out.dto.ts` (add earlyReason).
- `backend/src/attendance/attendance-checkin.service.ts` (checkIn: add guard + include `lateReason` in `checkinData` + `reason: lateReason` in the check_in `attendanceLog.create` at ~line 195-211; checkOut: add guard + `earlyReason` in update data + `reason: earlyReason` in the check_out `attendanceLog.create` at ~line 375-391).
Create:
- New Prisma migration `backend/prisma/migrations/<ts>_attendance_late_early_reason/migration.sql` via `npx prisma migrate dev --name attendance_late_early_reason`.

## Implementation Steps
1. Add to Attendance model:
   `lateReason  String? @map("late_reason")`
   `earlyReason String? @map("early_reason")`
   Add to AttendanceLog model:
   `reason String? @map("reason")`
2. Run `npx prisma migrate dev --name attendance_late_early_reason` then `npx prisma generate`. (single migration covers all three columns)
3. check-in.dto.ts: add optional `lateReason` (ApiPropertyOptional, `@IsOptional() @IsString()`).
4. check-out.dto.ts: add optional `earlyReason` likewise.
5. checkIn() ~line 156-174: after computing `isLate`, add:
   `const lateReason = dto.lateReason?.trim();`
   `if (isLate && !lateReason) throw new BadRequestException('Vui lòng nhập lý do đi trễ (reason required for late check-in)');`
   add `lateReason` into `checkinData`; add `reason: lateReason` into the check_in `attendanceLog.create` data (~line 195-211).
6. checkOut() ~line 352-372: after computing `isEarlyOut`, add:
   `const earlyReason = dto.earlyReason?.trim();`
   `if (isEarlyOut && !earlyReason) throw new BadRequestException('Vui lòng nhập lý do về sớm (reason required for early check-out)');`
   add `earlyReason` into the update `data`; add `reason: earlyReason` into the check_out `attendanceLog.create` data (~line 375-391).
7. Compile: `cd backend && npm run build` (or `tsc --noEmit`).

## Todo
- [ ] Attendance schema fields added
- [ ] AttendanceLog.reason field added
- [ ] migration generated + applied + prisma generate
- [ ] check-in DTO
- [ ] check-out DTO
- [ ] checkIn guard + persist (Attendance + AttendanceLog)
- [ ] checkOut guard + persist (Attendance + AttendanceLog)
- [ ] backend compiles

## Success Criteria
- Late check-in without lateReason → 400 with message containing `reason`; with reason → 200, Attendance row has `lateReason` AND the check_in AttendanceLog row has `reason` (and `note` still holds any locationNote, separately).
- Early check-out without earlyReason → 400; with reason → 200, Attendance row has `earlyReason` AND check_out AttendanceLog row has `reason`.
- On-time check-in / non-early check-out → reason optional, ignored if absent.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration on prod against existing rows | Low | Med | Columns nullable, no backfill, no default churn |
| Guard breaks existing forgot-checkout path | Low | Med | markForgotCheckout() has no checkoutTime → never computes isEarlyOut; untouched |
| Message not matching frontend `reason` special-case | Med | Low | Ensure literal word `reason` in message (English part) |

## Security
- Reason is free text → rely on Prisma parameterization; no raw SQL. Trim only, no HTML render on backend.

## Next Steps
Phase 02 (endpoint grace fields) can start in parallel but final integration test needs this migration.
</content>
