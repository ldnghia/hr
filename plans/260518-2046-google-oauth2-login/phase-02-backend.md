# Phase 02 — Backend: GoogleStrategy + OAuth Endpoints

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** ~2h
- **Blockers:** Phase 01

Add passport-google-oauth20 strategy, two endpoints (`/auth/google`, `/auth/google/callback`), and `loginWithGoogle` service method that links to an existing Employee by email.

## Context Links
- Existing strategy pattern: `backend/src/auth/strategies/jwt.strategy.ts`
- Auth module: `backend/src/auth/auth.module.ts`
- Auth controller: `backend/src/auth/auth.controller.ts`
- Auth service: `backend/src/auth/auth.service.ts`
- Env loader: `backend/src/config/` (or root `.env`)

## Key Insights
- `JwtAuthGuard` is global (APP_GUARD). The Google routes must be marked `@Public()` (existing decorator pattern) or use route-specific guards.
- Use redirect flow (not SPA token exchange) — simpler, no client secret on frontend.

## Requirements
- Functional:
  - `GET /auth/google` → 302 to Google consent screen
  - `GET /auth/google/callback` → handle code, validate, issue JWT, 302 to frontend `/auth/callback?token=...` or `?error=...`
  - Link `googleId` on first successful match
  - Reject if no Employee with that email, or status != active
- Non-functional:
  - No secrets in code; env-only
  - State param verified (CSRF)

## Architecture
```
AuthController
  GET /auth/google         -> @UseGuards(GoogleAuthGuard) (triggers passport)
  GET /auth/google/callback-> @UseGuards(GoogleAuthGuard) -> service.loginWithGoogle(req.user)
GoogleStrategy(PassportStrategy(Strategy, 'google'))
  validate(accessToken, refreshToken, profile, done)
    -> returns { email, googleId, displayName }
AuthService.loginWithGoogle({ email, googleId })
  -> employee = prisma.employee.findUnique({ email })
  -> if !employee || status !== ACTIVE -> throw UnauthorizedException with code
  -> if employee.googleId && employee.googleId !== googleId -> throw Conflict
  -> if !employee.googleId -> update { googleId }
  -> return jwtService.sign(payload)
```

## Related Code Files
- Create: `backend/src/auth/strategies/google.strategy.ts`
- Create: `backend/src/auth/guards/google-auth.guard.ts`
- Modify: `backend/src/auth/auth.module.ts` (register GoogleStrategy)
- Modify: `backend/src/auth/auth.controller.ts` (two new endpoints)
- Modify: `backend/src/auth/auth.service.ts` (add `loginWithGoogle`)
- Modify: `backend/.env.example` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_OAUTH_REDIRECT_URL`)
- Modify: `backend/package.json` (dependency)

## Implementation Steps
1. Install: `cd backend && npm i passport-google-oauth20 && npm i -D @types/passport-google-oauth20`
2. Add env vars to `.env.example`:
   ```
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   FRONTEND_OAUTH_REDIRECT_URL=http://localhost:3001/auth/callback
   ```
3. Create `google.strategy.ts`:
   - Extends `PassportStrategy(Strategy, 'google')`
   - `scope: ['email', 'profile']`
   - `validate()` returns `{ email: profile.emails[0].value, googleId: profile.id, displayName: profile.displayName }`
4. Create `google-auth.guard.ts` extending `AuthGuard('google')`.
5. Update `auth.module.ts` — add `GoogleStrategy` to providers.
6. Update `auth.controller.ts`:
   ```ts
   @Public()
   @UseGuards(GoogleAuthGuard)
   @Get('google')
   async googleAuth() {}

   @Public()
   @UseGuards(GoogleAuthGuard)
   @Get('google/callback')
   async googleCallback(@Req() req, @Res() res) {
     try {
       const { token } = await this.authService.loginWithGoogle(req.user);
       return res.redirect(`${redirectBase}?token=${token}`);
     } catch (e) {
       return res.redirect(`${redirectBase}?error=${e.code ?? 'oauth_failed'}`);
     }
   }
   ```
7. Implement `AuthService.loginWithGoogle`:
   - Lookup by email (case-insensitive — match existing login behavior)
   - Status check (`ACTIVE`)
   - googleId conflict check
   - Link if absent (`prisma.employee.update`)
   - Sign JWT with same payload shape as password login (`sub`, `email`, `role`)
   - Audit log entry (reuse existing AuditLog service) — action `LOGIN_GOOGLE`
8. Compile: `npm run build` — fix any TS errors.
9. Manual smoke: hit `http://localhost:3000/auth/google` in browser.

## Todo
- [ ] Install passport-google-oauth20 deps
- [ ] Add env vars (`.env.example` + local `.env`)
- [ ] Create `google.strategy.ts`
- [ ] Create `google-auth.guard.ts`
- [ ] Register strategy in `auth.module.ts`
- [ ] Add `/auth/google` + `/auth/google/callback` endpoints
- [ ] Implement `loginWithGoogle` in `auth.service.ts`
- [ ] Add AuditLog entry for Google login
- [ ] `npm run build` passes
- [ ] Unit test `loginWithGoogle` (found/not-found/inactive/conflict)

## Success Criteria
- Valid employee email → 302 to frontend with valid JWT
- Unknown email → 302 to frontend with `?error=not_registered`
- Inactive employee → `?error=account_disabled`
- Conflict on googleId → `?error=account_conflict`
- JWT validates against existing `JwtAuthGuard` on protected routes

## Test Matrix
| Case | Input | Expected |
|------|-------|----------|
| Happy path, first link | known email, no googleId | 302 + token, googleId persisted |
| Happy path, returning | known email, matching googleId | 302 + token |
| Unknown email | not in DB | 302 + `error=not_registered` |
| Inactive | status=INACTIVE | 302 + `error=account_disabled` |
| GoogleId conflict | googleId mismatch | 302 + `error=account_conflict` |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Callback URL mismatch in Google Console | High | Med | Document setup in README; surface clear 400 |
| Secret leak via logs | Med | High | Never log `req.user`, never log full URLs |
| Email casing mismatch | Med | Med | Lowercase both sides before lookup |

## Security Considerations
- `state` param auto-handled by passport — ensure `session: false` isn't disabled in a way that drops it; use `state: true` option if needed.
- Short-lived JWT (existing `expiresIn` config) limits leaked-URL window.
- Do not include `googleId` in JWT payload (PII minimization).

## Next Steps
- Unblocks Phase 03 (frontend redirect target).
