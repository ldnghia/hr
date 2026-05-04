# Phase 03 — Frontend UI

## Context Links
- Template: `frontend/src/app/leave/` (list + create modal, status badges)
- Service layer: `frontend/src/services/attendance.service.ts`
- Axios: `frontend/src/lib/axios`
- Phase 02 endpoints

## Overview
- **Priority:** P2
- **Status:** pending
- **Description:** Add correction request flows to the attendance pages. Employee creates/views/cancels own requests. HR/Admin reviews and direct-edits. Show "Corrected" badge on edited rows.

## Key Insights
- Reuse leave UI patterns (modal form + table) to minimize churn.
- Single page entry: tabbed UI on `/attendance` → "My Attendance" (existing), "Correction Requests" (new). Admin sees a 3rd tab "Manage Corrections".
- All API calls through new service file; never raw `fetch`.
- Loading/error/empty states required on every list view.

## Requirements

### Functional
- Employee: list own requests with status filter; create request from a specific attendance row; cancel pending.
- Admin/HR: list all requests; approve/reject with note; direct-edit any attendance row.
- All attendance tables: show "Corrected" badge when `isCorrected=true`; tooltip shows linked correction id and reviewer.

### Non-Functional
- Mobile-friendly modal forms (Tailwind responsive).
- i18n keys added (en + vi at minimum).
- Each component file < 200 LOC.

## Architecture

### File layout
```
frontend/src/services/
└── attendance-correction.service.ts          (API calls, ~80 LOC)

frontend/src/app/attendance/
└── components/
    ├── correction-request-list.tsx           (employee tab, ~150 LOC)
    ├── correction-request-form-modal.tsx     (create form, ~150 LOC)
    ├── correction-admin-panel.tsx            (admin tab, ~180 LOC)
    ├── correction-review-modal.tsx           (approve/reject, ~120 LOC)
    ├── admin-edit-attendance-modal.tsx       (~150 LOC)
    └── corrected-badge.tsx                   (~30 LOC)

frontend/src/app/attendance/page.tsx           (modified — add tabs)
frontend/public/locales/{en,vi}/attendance.json (modified)
```

### Service contract
```ts
listMyRequests(params)
listAllRequests(params)
getRequest(id)
createRequest(payload)
cancelRequest(id)
approveRequest(id, reviewNote?)
rejectRequest(id, reviewNote)
adminEditAttendance(attendanceId, payload)
```

### UX flows

**Employee submit**
1. Click "Request Correction" on a row in My Attendance table.
2. Modal pre-fills original values; user toggles which fields to change + enters reason.
3. Submit → toast success → refetch list. On 400 (limit reached) → inline banner.

**Admin review**
1. Manage tab → table of pending requests with diff view (original vs requested).
2. Approve/Reject buttons → modal with optional/required note.
3. After action → row updates in place; attendance table refetches.

**Admin direct edit**
1. From any attendance row → "Edit (admin)" button (visible when role=admin).
2. Modal lets admin set any correctable field + reason.
3. Submit → toast → refetch.

## Related Code Files

**Create**
- `frontend/src/services/attendance-correction.service.ts`
- `frontend/src/app/attendance/components/correction-request-list.tsx`
- `frontend/src/app/attendance/components/correction-request-form-modal.tsx`
- `frontend/src/app/attendance/components/correction-admin-panel.tsx`
- `frontend/src/app/attendance/components/correction-review-modal.tsx`
- `frontend/src/app/attendance/components/admin-edit-attendance-modal.tsx`
- `frontend/src/app/attendance/components/corrected-badge.tsx`

**Modify**
- `frontend/src/app/attendance/page.tsx` (add tabs + role-gated admin tab)
- `frontend/src/services/attendance.service.ts` (add `isCorrected` to types if missing)
- `frontend/public/locales/en/attendance.json`
- `frontend/public/locales/vi/attendance.json`

**Read for context**
- `frontend/src/app/leave/page.tsx` and modal components
- `frontend/src/lib/axios` (interceptor pattern)

## Implementation Steps
1. Create `attendance-correction.service.ts` with typed methods + TS interfaces matching backend DTOs.
2. Build `corrected-badge.tsx` (small, presentational).
3. Build `correction-request-form-modal.tsx` — controlled fields, "change this field" toggles, validation, submit handler.
4. Build `correction-request-list.tsx` — table with status pill, cancel action for pending, empty/loading/error states.
5. Build `correction-review-modal.tsx` — diff view, approve/reject buttons, note field with conditional required.
6. Build `correction-admin-panel.tsx` — list w/ filters, opens review modal.
7. Build `admin-edit-attendance-modal.tsx` — direct-edit form with reason.
8. Modify `attendance/page.tsx` — add tab navigation, role gating (`useAuth` / role check).
9. Inject `<CorrectedBadge/>` in attendance row renderer.
10. Add i18n keys.
11. Run `cd frontend && npm run build` — fix TS errors.
12. Manual UAT on dev server.

## Todo
- [ ] Service file + types
- [ ] CorrectedBadge component
- [ ] Form modal (create)
- [ ] Request list (employee)
- [ ] Review modal (approve/reject)
- [ ] Admin panel
- [ ] Admin direct-edit modal
- [ ] Tabs in attendance page
- [ ] Badge in attendance table
- [ ] i18n en + vi keys
- [ ] Build passes
- [ ] Manual UAT: submit, limit error, approve, reject, cancel, admin edit

## Success Criteria
- Employee with role=employee can submit, see, cancel own requests; cannot see others'.
- Hitting monthly limit shows clear error message (server-driven).
- Admin/HR sees Manage tab; can approve/reject; corresponding attendance row immediately reflects new values + Corrected badge.
- Admin direct-edit updates row + creates a correction record visible in admin panel.
- All lists handle loading/error/empty states.
- No raw `fetch` introduced; all calls via shared axios instance.
- All component files < 200 LOC.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tab gating leaks admin UI to employees | Low | Med | Server is source of truth (RBAC); UI gating is defense-in-depth |
| Stale list after approve | Med | Low | Refetch list + parent attendance query on success |
| Form complexity > 200 LOC | Med | Low | Split fields into sub-component if hit |
| i18n key drift | Low | Low | Add both en + vi in same PR |

## Security
- No secrets in code. JWT via existing axios interceptor.
- Role check on Admin tab is UX only; backend enforces authoritative RBAC.
- Sanitize reason/reviewNote display (React default escaping is sufficient).

## Next Steps
- After Phase 03 merges: notify `tester` for E2E, `code-reviewer` for review, `docs-manager` to update `docs/system-architecture.md` and `docs/project-changelog.md`.
