# HR Management System — Dcorp: Project Overview & PDR

## Executive Summary

Full-stack HR management system for Dcorp (~150 employees across 2 branches: HCM & HN). Monorepo architecture with NestJS 10 backend, Next.js 16 frontend, PostgreSQL via Prisma 5.

**Tech Stack**: NestJS 10 | Next.js 16.2 | PostgreSQL | Prisma 5 | React 19 | TailwindCSS 4 | JWT | Swagger | Docker-ready

**Status**: In Active Development (v1.0)

---

## Project Goals

| Goal | Metric | Owner |
|------|--------|-------|
| Automate leave request workflows | 100% requests processed digitally | HR Team |
| Track attendance across 2 branches | 95%+ check-in coverage | Ops Team |
| Enable self-service employee info | <5min profile update time | HR |
| Support role-based access control | Zero unauthorized access | Security |
| Maintain audit trail of all changes | 100% mutation logging | Compliance |

---

## Stakeholders

- **HR Team**: Daily leave approvals, employee onboarding/offboarding
- **Managers**: Team attendance monitoring, leave approvals, performance decisions
- **Employees**: Leave requests, profile updates, attendance check-in/out
- **Admin**: System config, user management, audit logs, workflow setup

---

## Scope: In / Out

### In Scope ✓

- **Employee management**: onboarding, profiles, history tracking
- **Leave requests**: multi-step approval, balance management, accrual
- **Attendance**: GPS-based check-in/out, shift assignment, raw data import
- **Offboarding**: resignation workflow, exit checklist
- **Contracts**: contract types, expiry tracking
- **Organizational hierarchy**: branch, department, position, shifts
- **Workflow engine**: configurable approval steps (not hardcoded)
- **Audit logging**: all mutations tracked with user/timestamp
- **RBAC**: admin, hr, manager, employee roles
- **Telegram notifications**: optional, for approvals/alerts
- **Calendar**: holidays, working days, calendar years

### Out of Scope ✗

- Payroll module (HR handles separately)
- Training/LMS modules
- Performance appraisal
- Third-party integrations (except Telegram)
- Mobile app (planned for v2)

---

## Core Modules (18 Total)

| Module | Purpose | Key Entities |
|--------|---------|--------------|
| **auth** | Login, JWT, role guards | User, Role, Token |
| **employee** | Profiles, status tracking, history | Employee, EmployeeHistory |
| **organization** | Branches, depts, positions | Branch, Department, Position |
| **leave** | Requests, approvals, balance | LeaveRequest, LeaveApproval, LeaveBalance |
| **attendance** | Check-in/out, shifts, reporting | Attendance, Shift, AttendanceLog |
| **offboarding** | Resignation, exit checklist | ResignationRequest, OffboardingChecklist |
| **contract** | Contract lifecycle | Contract |
| **calendar** | Holidays, working days | CalendarYear, Holiday |
| **workflow** | Approval flow config | ApprovalFlow, ApprovalStep |
| **working-shift** | Shift management | WorkingShift |
| **office** | Office locations, GPS | OfficeLocation |
| **reward** | Decisions, bonuses, penalties | Decision |
| **audit** | Change log | AuditLog |
| **me** | Current user endpoints | User profile, password |
| **system-config** | Global settings | SystemConfig |
| **notification** | Telegram alerts | Notification |
| **prisma** | ORM layer | PrismaClient |
| **common** | Shared filters, guards, interceptors | Validation, Auth |

---

## Database Overview

35 Prisma models tracked in PostgreSQL. Key relationships:

- **Employee** ← manages → Employee (self-referencing for manager)
- **Employee** → Branch, Department, Position, Office, Shift
- **LeaveRequest** → LeaveApproval (multi-step)
- **ResignationRequest** → ResignationApproval (multi-step)
- **EmployeeHistory**: Change log for employee data mutations
- **AuditLog**: Immutable record of ALL mutations (POST/PUT/PATCH/DELETE)

**Backup Strategy**: Daily automated snapshots (DevOps responsibility)

---

## API Architecture

**Global Prefix**: `/api/v1`

**Response Format** (List endpoints):
```json
{
  "data": [...],
  "meta": { "total": 150, "page": 1, "limit": 10, "totalPages": 15 }
}
```

**Response Format** (Single/Action):
```json
{ "data": {...} } or { "message": "Success" }
```

**Error Format**:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/v1/...",
  "method": "POST",
  "timestamp": "2026-04-22T10:30:00Z"
}
```

**Authentication**: Bearer JWT in `Authorization` header. 24-hour expiry (configurable).

**Documentation**: Swagger UI at `/api/docs` (auto-generated from @nestjs/swagger decorators)

---

## Frontend Architecture

**Framework**: Next.js 16 App Router

**Key Patterns**:
- Centralized Axios instance (`lib/axios.ts`) with JWT interceptor
- AuthContext + useAuth hook for session management
- RBAC utility functions (hasRole, isApprover, etc.)
- Service layer for API calls (12 services, ~700 LOC)
- Single types file (`types/index.ts`, 338 LOC)
- TailwindCSS custom UI components (Button, Input, Modal, Table, Badge, Pagination, etc.)

**Pages**: 18 main routes (dashboard, login, employees, leave, attendance, offboarding, etc.)

**i18n**: Vietnamese (default) + English, powered by i18next

**PWA**: ServiceWorker registered, offline.html fallback

---

## Key Design Decisions

1. **Multi-step approval**: ApprovalFlow + ApprovalStep configurable per workflow (not hardcoded manager→HR)
2. **History tracking**: EmployeeHistory captures all field changes; AuditLog immutable mutation record
3. **Business day logic**: Mon-Fri only (configurable via calendar); half-day leave support
4. **GPS-based attendance**: Geo-fenced office locations with configurable radius (default 50m)
5. **Shift flexibility**: Supports fixed schedules or shift-based assignments per employee
6. **Role-based access**: 4 roles (admin=4, hr=3, manager=2, employee=1) with guard-based enforcement
7. **No hardcoded secrets**: All config via env vars (JWT_SECRET, DATABASE_URL, CORS_ORIGIN, etc.)

---

## Development Workflow

1. **Planning**: Create plan in `./plans/{date}-{slug}/`
2. **Backend**: NestJS services tested with Jest
3. **Frontend**: Next.js pages with client-side validation
4. **Testing**: Unit tests for critical services, E2E tests for workflows
5. **Review**: Code review before merge to `main`
6. **Deployment**: Docker containers (backend + frontend)

---

## Success Criteria (v1.0)

- [ ] All 18 modules functional and tested
- [ ] 100% of employee workflows digital (no paper forms)
- [ ] <5% API error rate in production
- [ ] All mutations logged to AuditLog
- [ ] 2FA optional for admin accounts
- [ ] Documentation complete (README, API docs, runbooks)
- [ ] Performance: API responses <500ms, frontend load <3s
- [ ] Security: No hardcoded secrets, HTTPS enforced, SQL injection prevented

---

## Known Constraints

- No external payment gateway (HR uses separate system)
- No mobile app yet (v2 roadmap)
- Telegram notifications optional (not required for MVP)
- Single PostgreSQL instance (no geo-replication yet)
- Admin UI limited (primarily REST API + basic dashboard)

---

## Next Steps (Roadmap)

1. **v1.1**: Mobile app (React Native), 2FA, advanced reporting
2. **v1.2**: Payroll module (basic), bank integration
3. **v2.0**: Multi-tenant support, API versioning (v2), GraphQL option

---

## Quick Links

- **Backend**: `F:/AI/hr_project/backend/`
- **Frontend**: `F:/AI/hr_project/frontend/`
- **Database Schema**: `backend/prisma/schema.prisma`
- **API Docs**: Swagger at `/api/docs` (runtime)
- **Code Standards**: `docs/code-standards.md`
- **System Architecture**: `docs/system-architecture.md`
