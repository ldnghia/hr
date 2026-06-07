# Phase 03 — Frontend Fingerprint + Check-in Integration

## Context
- Hook: `frontend/src/app/attendance/hooks/use-checkin-checkout.ts` (line 71 `gpsPayload`)
- Service: `frontend/src/services/attendance.service.ts` (CheckInPayload/CheckOutPayload already have `deviceId`)
- Page: `frontend/src/app/attendance/page.tsx`
- Depends on: Phase 02 (API contract finalized)

## Overview
- Priority: P1
- Status: pending
- Generate stable device fingerprint in browser; auto-attach to every check-in/out; show WARN banner if backend flags unknown device.

## Requirements

### Functional
- Compute fingerprint once per session, cache in `localStorage` (`hr.deviceFingerprint`).
- Send fingerprint as `deviceId` on every check-in / check-out.
- On WARN-mode unknown-device response, show toast/banner with link to `/devices` registration page.
- On STRICT-mode 403, show actionable message + link to register.

### Non-functional
- No external paid SDK — use custom hash or `@fingerprintjs/fingerprintjs` open-source v3 (MIT).
- Fingerprint must work offline (no remote calls).
- File size <200 lines.

## Decision: Fingerprint Source
**Choice: custom SHA-256 hash** of stable navigator properties — KISS / YAGNI. Avoids extra dependency. Fingerprint inputs:
- `navigator.userAgent`
- `navigator.language`
- `screen.width × screen.height × screen.colorDepth`
- `navigator.hardwareConcurrency`
- `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `navigator.platform`

Hash via `crypto.subtle.digest('SHA-256', ...)`. Stable across reloads, changes on major browser/OS update (acceptable — user re-registers).

## Files to CREATE
```
frontend/src/lib/device-fingerprint.ts   # generate + cache
```

## Files to MODIFY
- `frontend/src/app/attendance/hooks/use-checkin-checkout.ts` — call `getDeviceFingerprint()` in `gpsPayload`.
- `frontend/src/services/attendance.service.ts` — extend `CheckInResponse` with `isUnknownDevice?: boolean`.
- `frontend/src/app/attendance/page.tsx` — show banner when `actionMsg` contains unknown-device flag.

## Implementation

### `device-fingerprint.ts` (skeleton)
```ts
const STORAGE_KEY = 'hr.deviceFingerprint';

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) return cached;
  const raw = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(navigator.hardwareConcurrency ?? 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.platform,
  ].join('|');
  const buf = new TextEncoder().encode(raw);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(STORAGE_KEY, hash);
  return hash;
}

export function clearDeviceFingerprint(): void {
  localStorage.removeItem(STORAGE_KEY);
}
```

### Modify `use-checkin-checkout.ts` `gpsPayload`
```ts
async function gpsPayload(shiftId?: number) {
  const deviceId = await getDeviceFingerprint();
  return {
    lat: geo.lat ?? undefined,
    lng: geo.lng ?? undefined,
    deviceId,
    locationNote: needsReason ? locationNote.trim() : undefined,
    ...(shiftId ? { shiftId } : {}),
  };
}
```
Note: `gpsPayload` becomes async — update both call sites (`handleCheckIn`, `handleCheckOut`).

### STRICT 403 handling
In `extractErrMsg` catch block, detect `403` + message includes "Thiết bị" → set actionMsg with link: `t('attendance.deviceNotRegistered')` + button "Đăng ký thiết bị này" → navigate `/devices`.

### WARN flag handling
After successful check-in, if `result.isUnknownDevice`, append warning to success toast: "(Thiết bị chưa đăng ký — vui lòng đăng ký để tránh bị chặn)".

## Todo
- [ ] Create `device-fingerprint.ts`
- [ ] Update `gpsPayload` → async + include deviceId
- [ ] Update `handleCheckIn` / `handleCheckOut` to await
- [ ] Update `handlePickerSelect` similarly
- [ ] Extend `CheckInResponse` type with `isUnknownDevice`
- [ ] Add i18n keys: `attendance.deviceNotRegistered`, `attendance.unknownDeviceWarning`
- [ ] Page: render unknown-device banner with CTA link

## Success Criteria
- `localStorage.getItem('hr.deviceFingerprint')` populated after first check-in attempt.
- Network tab: every check-in/out POST body includes `deviceId` (64-hex string).
- STRICT 403 from backend → user sees actionable error with link to `/devices`.
- WARN unknown → success toast with sub-warning.
- Existing check-in flow (registered device) unchanged visually.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `crypto.subtle` unavailable (HTTP, old browser) | Low | Med | Fallback: simple JS hash; HTTPS already required for GPS |
| Fingerprint differs across browsers same machine | High | Low | By design — each browser = separate device; user registers each |
| localStorage cleared → re-register prompt | Med | Low | Auto-regenerate; if STRICT, user clicks "register this device" |
| Async gpsPayload introduces race conditions | Low | Med | Single await; existing button has `loadingShiftId` lock |

## Rollback
- Revert frontend commit — backend still works (DISABLED/WARN modes accept missing deviceId).
- No data migration; localStorage value harmless if orphaned.

## Security Considerations
- Fingerprint is NOT a secret — server validates against per-employee whitelist, not signature.
- No PII stored in fingerprint inputs (userAgent OK — already sent in every HTTP request).

## Next Steps
Can run in parallel with Phase 04 — no file overlap.
