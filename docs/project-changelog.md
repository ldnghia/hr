# Project Changelog — HR Management System

All significant changes to the HR Management System are documented here.

---

## [v1.0.0] — May 18, 2026 (In Development)

### Added

#### Authentication & Security
- **Google OAuth2 Login** (NEW)
  - PassportJS Google OAuth2 strategy implementation
  - Redirect-based OAuth2 flow with Google consent screen
  - CSRF state verification via express-session middleware
  - Account linking by email match only (no auto-registration)
  - Error codes: `not_registered`, `account_disabled`, `account_conflict`, `oauth_failed`
  - Frontend OAuth callback page (`/auth/callback`)
  - "Continue with Google" button on login page
  - Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_OAUTH_REDIRECT_URL`, `SESSION_SECRET`

#### Database
- Employee model: New `googleId` field (nullable, unique) for OAuth2 linking
- Prisma schema updated to support OAuth2

#### Backend
- `backend/src/auth/strategies/google.strategy.ts` — PassportJS Google OAuth2 strategy
- `backend/src/auth/guards/google-auth.guard.ts` — Guard for Google OAuth2
- `AuthService.loginWithGoogle()` method — Account linking & JWT generation
- `AuthController` routes:
  - `GET /api/v1/auth/google` — Initiate OAuth2 flow
  - `GET /api/v1/auth/google/callback` — OAuth2 callback handler
- Express-session middleware in `main.ts` for CSRF state verification

#### Frontend
- `frontend/src/app/auth/callback/page.tsx` — OAuth callback token handler
- Login page updated with "Continue with Google" button
- Automatic token storage & redirect to dashboard on successful login
- Error handling for OAuth failures

### Changed

- No breaking changes to existing authentication flow
- Traditional email+password login remains unchanged and fully functional

### Security
- All OAuth2 credentials stored in environment variables only
- No hardcoded client secrets
- CSRF state protection via express-session
- Account linking prevents unauthorized access via email verification

---

## [v0.9.0] — April 22, 2026

### Added

#### Core Features
- Employee management (CRUD, profiles, history tracking)
- Organization structure (branches, departments, positions)
- Leave management (requests, approvals, balance tracking)
- Attendance tracking (check-in/out, GPS validation, shift assignment)
- Multi-step approval workflows (configurable via ApprovalFlow)
- Offboarding & resignation workflows
- Role-based access control (4 roles: admin, hr, manager, employee)

#### Backend
- NestJS API with 18 modules
- Prisma ORM with 35 models
- JWT authentication (24h expiry)
- Global validation, error handling, logging
- AuditLog & EmployeeHistory for audit trails
- Telegram notification integration (optional)

#### Frontend
- Next.js 16 with React 19 & TailwindCSS 4
- Dashboard with stats & pending approvals
- Employee management UI
- Leave request & approval forms
- Attendance check-in/out interface
- Protected routes & role-based UI

#### Database
- PostgreSQL with 13 migrations
- Comprehensive schema for HR operations
- Backup & recovery planning

### Known Issues
- Some leave approval workflows incomplete (70%)
- Attendance shift processing needs refinement (70%)
- No GPS validation error handling (0%)
- Telegram notifications not fully integrated (25%)
- Unit tests minimal (5%)

---

## Release Notes Template

For future releases, use this format:

```markdown
## [vX.Y.Z] — YYYY-MM-DD

### Added
- Feature 1
- Feature 2

### Changed
- Modification 1
- Modification 2

### Fixed
- Bug fix 1
- Bug fix 2

### Deprecated
- Old API endpoint

### Removed
- Unused dependency

### Security
- Security improvement 1
- Security improvement 2

### Breaking Changes
- Change that breaks backward compatibility
```

---

## How to Update This Changelog

1. Before each release, create a new section with version & date
2. Group changes by type: Added, Changed, Fixed, etc.
3. Include internal references (issue #123, PR #456)
4. Link to detailed documentation when relevant
5. Commit with message: `docs: update changelog for vX.Y.Z`
6. Share release notes with stakeholders

---

## Version History Summary

| Version | Date | Status | Highlights |
|---------|------|--------|-----------|
| v1.0.0 | May 18, 2026 | In Development | Google OAuth2, core features complete |
| v0.9.0 | Apr 22, 2026 | Complete | MVP foundation, all core modules |
| v0.1.0 | Jan 2026 | Archive | Initial project setup |
