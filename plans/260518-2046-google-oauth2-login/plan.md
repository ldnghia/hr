---
title: "Google OAuth2 Login Integration"
description: "Add Google OAuth2 SSO that links to existing employee accounts by email match (no auto-registration)"
status: pending
priority: P2
effort: 4h
branch: main
tags: [auth, oauth, backend, frontend, security]
created: 2026-05-18
---

# Google OAuth2 Login

## Goal
Enable internal employees to sign in with their corporate Google account. OAuth must **only** link to pre-existing Employee rows by exact email match. No auto-provisioning.

## Phases

| # | Phase | Status | Effort | Blockers |
|---|-------|--------|--------|----------|
| 01 | [Database — Add googleId field](./phase-01-database.md) | pending | 30m | — |
| 02 | [Backend — GoogleStrategy + endpoints](./phase-02-backend.md) | pending | 2h | Phase 01 |
| 03 | [Frontend — Login button + callback page](./phase-03-frontend.md) | pending | 1.5h | Phase 02 |

## Key Dependencies
- `passport-google-oauth20` + `@types/passport-google-oauth20` (backend)
- Google Cloud Console OAuth2 Client (env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`)
- Existing Employee table with unique email index

## Data Flow
```
[User] -> Login Page -> GET /auth/google
       -> Google consent
       -> GET /auth/google/callback (code)
       -> AuthService.loginWithGoogle(profile)
            -> findUnique(email) [REQUIRED]
            -> reject if not found / inactive
            -> link googleId on first match
            -> issue JWT
       -> 302 redirect to /auth/callback?token=<jwt>
       -> Frontend stores JWT in localStorage -> /dashboard
```

## Failure Modes & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Email not in Employee table | High | Low | Redirect to login with `?error=not_registered` |
| Employee status != active | Medium | High | Reject in service, error code `account_disabled` |
| googleId already linked to different email | Low | High | Unique index on googleId; throw on mismatch |
| Token leaked in URL fragment logs | Medium | High | Use short-lived JWT; document not logging querystrings |
| OAuth callback CSRF | Low | Medium | Use `state` param verified by passport |

## Backwards Compatibility
- Password login untouched. `password` remains nullable; `googleId` is additive nullable column.
- Existing JWT shape unchanged — same `JwtAuthGuard` validates Google-issued tokens.

## Rollback Plan
- Phase 01: `prisma migrate resolve` + drop column migration.
- Phase 02: Remove route registrations; keep migration in place (no data loss).
- Phase 03: Hide Google button via feature flag / remove from JSX.

## Success Criteria
- [ ] Existing employee with matching Google email can log in without password
- [ ] Non-employee Google account is rejected with clear error
- [ ] `googleId` persisted on first successful link
- [ ] Password login still works for all existing accounts
- [ ] No new dependencies added to frontend (uses redirect flow only)
