# Phase 04 — Surface reasons to admin / export

## Context Links
- `backend/src/attendance/attendance-export-late-early-sheet.ts` (late/early Excel sheet; `note` col line 71/150-151)
- `frontend/src/app/attendance/components/admin-attendance-detail-view.tsx` (modified per git status)
- `frontend/src/app/attendance/components/admin-attendance-report.tsx` + `admin-attendance-report-types.ts`
- `frontend/src/app/attendance/components/admin-attendance-detail-export.ts` (new, untracked)

## Overview
Priority P2 (secondary). Make the newly captured reasons visible where admins review late/early.
Keep MINIMAL and additive (YAGNI): show the reason alongside existing late/early data. Full
re-design of reports is OUT OF SCOPE.

## Scope Decision
IN scope (this plan):
- Late/early Excel sheet: add a dedicated "Lý do trễ/sớm" column sourced from
  `Attendance.lateReason` / `earlyReason` (pick the one matching the flagged direction of the row),
  distinct from existing "Ghi chú" (checkin/checkout note) column.
- Admin attendance detail view: display lateReason when isLate, earlyReason when isEarlyOut.
OUT of scope (flag as follow-up):
- Filtering/searching by reason, analytics, correction-flow integration.

## Requirements
- Export service that feeds `buildLateEarlySheet` must include `lateReason`/`earlyReason` in its
  Prisma select (verify caller — likely `attendance-export-combined.service.ts`, currently modified).
- Excel: add column header + cell; color/format consistent with existing late/early columns.
- Admin detail component: read new fields from the attendance record type; render read-only,
  React-escaped text.

## Related Code Files
Modify:
- `backend/src/attendance/attendance-export-late-early-sheet.ts` (add column to header + row builder + row projection ~lines 61-71, 145-152).
- The export service selecting the rows (add `lateReason`, `earlyReason` to select).
- `frontend/src/app/attendance/components/admin-attendance-report-types.ts` (add fields to row type).
- `frontend/src/app/attendance/components/admin-attendance-detail-view.tsx` (render reason).

## Implementation Steps
1. Grep the caller of `buildLateEarlySheet` to confirm the record select; add reason fields.
2. Add reason column to the sheet (header, width, row value = row.late>0 ? lateReason : earlyReason, or both).
3. Extend frontend admin row type + detail view rendering.
4. Compile backend + frontend typecheck.

## Todo
- [ ] export record select includes reasons
- [ ] late/early sheet reason column
- [ ] admin row type extended
- [ ] admin detail view renders reason
- [ ] typecheck (be+fe)

## Success Criteria
- Excel late/early sheet shows the reason for flagged rows in its own column (not merged into Ghi chú).
- Admin detail view shows lateReason for late sessions, earlyReason for early ones; empty when none.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Export select misses field → blank column | Med | Low | Verify caller select in step 1 |
| Column index shift breaks existing sheet layout | Low | Med | Append column at end; adjust width array length |

## Security
Read-only display; React escaping / ExcelJS text cells — no injection concern.

## Next Steps
None — terminal display phase. Tests in Phase 05.
</content>
