# Phase 04 — Frontend Device Management UI

## Context
- Existing admin patterns: `frontend/src/app/attendance/components/correction-admin-panel.tsx`
- Axios instance: `frontend/src/lib/axios`
- Depends on: Phase 02 (API endpoints)
- Parallel with: Phase 03

## Overview
- Priority: P1
- Status: pending
- Two UIs: employee self-service (`/devices`) and admin/HR panel (`/admin/devices`).

## Requirements

### Functional — Employee `/devices`
- List own registered devices (name, last used, registered date, active status).
- Button "Đăng ký thiết bị này" → fingerprint current browser → POST `/devices/register` → show success.
- Button per device "Vô hiệu hóa" → DELETE `/devices/me/:id` (soft).
- Max 3 active devices — show warning + disable register button at limit.

### Functional — Admin `/admin/devices`
- Filter by employee (search), active status.
- Paginated table: employee name, device name, fingerprint (truncated), last used, registered by, status.
- Actions per row: deactivate, reactivate, rename.
- Bulk register on behalf of employee (rare — used for kiosk shared devices? **NOT in v1, deferred**).

### Non-functional
- Reuse existing UI components (table, modal, badge from correction-admin-panel pattern).
- File size <200 lines each — split into:
  - `page.tsx` (container)
  - `device-list.tsx`
  - `register-device-button.tsx`
  - `device-row-actions.tsx`

## Files to CREATE
```
frontend/src/app/devices/
├── page.tsx                          # employee self-service
├── components/
│   ├── my-devices-list.tsx
│   ├── register-current-device-button.tsx
│   └── device-status-badge.tsx

frontend/src/app/admin/devices/
├── page.tsx                          # admin panel
├── components/
│   ├── devices-table.tsx
│   ├── devices-filter-bar.tsx
│   ├── device-edit-modal.tsx
│   └── employee-search-select.tsx    # reuse if existing

frontend/src/services/device.service.ts
```

## Files to MODIFY
- `frontend/src/app/layout.tsx` or nav component — add nav link "Thiết bị của tôi" (employee) and "Quản lý thiết bị" (admin/hr).
- i18n locale files — add device-related strings.

## API Client (`device.service.ts`)
```ts
import api from '@/lib/axios';

export interface RegisteredDevice {
  id: number;
  employeeId: number;
  deviceFingerprint: string;
  deviceName: string | null;
  userAgent: string | null;
  isActive: boolean;
  registeredAt: string;
  lastUsedAt: string | null;
}

export const deviceService = {
  registerMine: (payload: { deviceFingerprint: string; deviceName?: string; userAgent?: string }) =>
    api.post('/devices/register', payload).then((r) => r.data),
  listMine: () => api.get<{ data: RegisteredDevice[] }>('/devices/me').then((r) => r.data),
  deactivateMine: (id: number) => api.delete(`/devices/me/${id}`).then((r) => r.data),
  // admin
  list: (params: { employeeId?: number; isActive?: boolean; page?: number; limit?: number }) =>
    api.get('/devices', { params }).then((r) => r.data),
  update: (id: number, body: { isActive?: boolean; deviceName?: string }) =>
    api.patch(`/devices/${id}`, body).then((r) => r.data),
  deactivate: (id: number) => api.delete(`/devices/${id}`).then((r) => r.data),
};
```

## UX Flows

### Employee self-register
```
/devices page loads
  → call listMine() → render list
  → user clicks "Đăng ký thiết bị này"
    → getDeviceFingerprint()
    → prompt for friendly name (modal, optional)
    → registerMine({ fingerprint, deviceName, userAgent })
    → refetch list → toast success
```

### Admin manage
```
/admin/devices loads
  → filter by employee (search) → call list({ employeeId })
  → table renders → admin clicks deactivate → confirm modal → update() → refetch
```

## Todo
- [ ] Create `device.service.ts`
- [ ] Build employee `/devices` page + components
- [ ] Build admin `/admin/devices` page + components
- [ ] Reuse `register-current-device-button` from Phase 03 banner CTA (DRY)
- [ ] Add RBAC route guard on `/admin/devices` (redirect non-admin/hr)
- [ ] Add nav links (visibility by role)
- [ ] i18n strings (vi + en)
- [ ] Loading / empty / error states per project rules

## Success Criteria
- Employee logs in → sees `/devices` link → can register current browser → device appears in list.
- Re-clicking register on same browser → backend returns 409 (unique constraint) → toast "Đã đăng ký".
- Deactivate device → row shows inactive badge → next check-in from that browser fails STRICT / warns WARN.
- Admin opens `/admin/devices` → filters by employee → sees all devices → can deactivate.
- Non-admin user hitting `/admin/devices` → redirected to `/`.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Employee registers, then browser update changes fingerprint → locked out | Med | Med | UI shows "register this device" CTA in WARN banner; admin can deactivate stale + employee re-registers |
| Admin accidentally deactivates wrong device | Low | Low | Confirm modal; soft delete (reactivatable) |
| Max-devices limit blocks legitimate use | Low | Low | Configurable env; UI shows clear "deactivate one to add" message |

## Rollback
- Remove nav links; revert page files.
- Backend endpoints harmless if unused.
- No data cleanup required.

## Security Considerations
- All endpoints behind JWT (axios interceptor).
- Admin routes guarded both client-side (RBAC redirect) and server-side (`@Roles` decorator from Phase 02).
- Never display full userAgent without truncation to avoid info leak in shared screen contexts.

## Next Steps
Final phase. After all four phases land:
1. Deploy with `DEVICE_VALIDATION_MODE=WARN`, 1-week grace.
2. Monitor `isUnknownDevice` rate → expect <5% after week 1.
3. Switch to `STRICT` once registration coverage acceptable.
