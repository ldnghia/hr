# Phase 03 — Frontend: Login Button + OAuth Callback Page

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** ~1.5h
- **Blockers:** Phase 02

Add "Continue with Google" button on login page; create callback route that consumes `?token=` or `?error=`.

## Context Links
- Login page: `frontend/src/app/login/page.tsx`
- Axios instance / auth helpers: `frontend/src/lib/axios.ts`
- Env: `frontend/.env.local` (`NEXT_PUBLIC_API_URL`)

## Key Insights
- Use full-page redirect to backend (`window.location.href = `${API_URL}/auth/google``). Avoids CORS preflight and matches passport's expected flow.
- Callback page must run client-side (`'use client'`) to read query string and write localStorage.

## Requirements
- Functional:
  - Visible Google button on `/login`
  - `/auth/callback` reads `token` → store in localStorage → redirect to `/dashboard` (or stored returnTo)
  - On `error` query → return to `/login?error=<code>` with friendly message
- Non-functional:
  - No new npm deps (use redirect, not `@react-oauth/google`)
  - i18n keys for new strings

## Architecture
```
[Login Page]
  Button onClick -> window.location.href = `${NEXT_PUBLIC_API_URL}/auth/google`

[/auth/callback page]
  useEffect on mount:
    params = new URLSearchParams(location.search)
    if params.token: localStorage.setItem('token', token); router.replace('/dashboard')
    else: router.replace(`/login?error=${params.error}`)
```

## Related Code Files
- Modify: `frontend/src/app/login/page.tsx` (add Google button + error banner)
- Create: `frontend/src/app/auth/callback/page.tsx`
- Modify (optional): `frontend/src/locales/{en,vi}/common.json` (i18n keys)
- Modify: `frontend/.env.example` (`NEXT_PUBLIC_API_URL` documented)

## Implementation Steps
1. Open `frontend/src/app/login/page.tsx`:
   - Add `<button type="button" onClick={handleGoogle}>` below password form
   - Handler:
     ```ts
     const handleGoogle = () => {
       window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
     };
     ```
   - Read `searchParams.error` (via `useSearchParams`) and render banner mapping codes:
     - `not_registered` → "Your Google account is not associated with an employee."
     - `account_disabled` → "Account inactive. Contact HR."
     - `account_conflict` → "This Google account is linked to a different employee."
     - default → "Login failed. Try again."
2. Create `frontend/src/app/auth/callback/page.tsx`:
   ```tsx
   'use client';
   import { useEffect } from 'react';
   import { useRouter, useSearchParams } from 'next/navigation';

   export default function OAuthCallback() {
     const router = useRouter();
     const params = useSearchParams();
     useEffect(() => {
       const token = params.get('token');
       const error = params.get('error');
       if (token) {
         localStorage.setItem('token', token);
         router.replace('/dashboard');
       } else {
         router.replace(`/login?error=${error ?? 'oauth_failed'}`);
       }
     }, [params, router]);
     return <div className="p-8 text-center">Signing you in…</div>;
   }
   ```
3. Add Google icon (inline SVG — no new dep).
4. Add i18n keys (if i18next active for login page).
5. Run `npm run build` in `frontend/` — verify Next.js 16 build passes.
6. Manual e2e: click button → Google consent → callback → dashboard.

## Todo
- [ ] Add Google login button to `login/page.tsx`
- [ ] Render error banner from `?error=` query
- [ ] Create `/auth/callback/page.tsx`
- [ ] Add i18n strings (en + vi)
- [ ] Verify `npm run build` passes
- [ ] Manual e2e happy path
- [ ] Manual e2e unknown email path

## Success Criteria
- Button visible, accessible (keyboard-focusable, aria-label)
- Happy path: click → Google → land on `/dashboard` authenticated
- Error path: shows friendly i18n message on `/login`
- Existing email/password login unaffected
- No console errors in browser

## Test Matrix
| Case | Action | Expected |
|------|--------|----------|
| Token in query | Visit `/auth/callback?token=valid` | localStorage set, redirect `/dashboard` |
| Error in query | Visit `/auth/callback?error=not_registered` | Redirect `/login?error=not_registered` |
| Missing both | Visit `/auth/callback` | Redirect `/login?error=oauth_failed` |
| Login page error | Visit `/login?error=account_disabled` | Friendly banner shown |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Token in URL appears in browser history | High | Med | Document; replace history entry via `router.replace` (already used) |
| `NEXT_PUBLIC_API_URL` undefined at build | Med | High | Fail fast: log & disable button if missing |
| XSS via crafted error code | Low | Med | Only render from a known whitelist of error codes |

## Security Considerations
- Never `eval` or render raw `error` value — map through allow-list.
- localStorage choice keeps parity with existing flow; document trade-off vs httpOnly cookie as future hardening.

## Next Steps
- Update `docs/system-architecture.md` with auth flow diagram.
- Future: consider switching whole flow to httpOnly cookie (out of scope here).

---

## Unresolved Questions
- Does the project use a `@Public()` decorator already, or do Google routes need a custom guard exclusion? (Phase 02 assumes yes; verify in `auth.module.ts` / `jwt-auth.guard.ts` before implementation.)
- Should we audit-log failed Google logins (unknown email)? Useful for shadow-IT detection but creates noise.
- Locale set — confirm whether `vi` keys are required or English-only acceptable for now.
- Should the JWT expiry differ for OAuth-issued tokens vs password-issued? Current plan reuses same expiry.
