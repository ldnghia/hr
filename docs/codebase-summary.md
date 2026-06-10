# Codebase Summary — HR Management System

Generated from repomix analysis (441,870 tokens, 264 files)

---

## Directory Structure

```
hr-project/
├── backend/              (NestJS API, ~180 TypeScript files)
│   ├── src/
│   │   ├── app.module.ts (18 module imports)
│   │   ├── main.ts       (Bootstrap: CORS, Swagger, ValidationPipe, HttpFilter)
│   │   ├── auth/         (JWT, Passport, RolesGuard)
│   │   ├── employee/     (Profiles, history tracking)
│   │   ├── leave/        (Requests, approvals, balance, workflow engine)
│   │   ├── attendance/   (Check-in/out, shifts, GPS, import)
│   │   ├── offboarding/  (Resignation, exit checklist)
│   │   ├── organization/ (Branches, departments, positions)
│   │   ├── contract/     (Contract lifecycle)
│   │   ├── calendar/     (Holidays, working days)
│   │   ├── workflow/     (Approval flow config)
│   │   ├── office/       (Office locations, GPS)
│   │   ├── reward/       (Decisions, bonuses, penalties)
│   │   ├── audit/        (Change log)
│   │   ├── working-shift/ (Shift management)
│   │   ├── me/           (Current user endpoints)
│   │   ├── notification/ (Telegram alerts)
│   │   ├── system-config/ (Global settings)
│   │   ├── prisma/       (ORM service)
│   │   └── common/       (Filters, guards, decorators)
│   ├── prisma/
│   │   ├── schema.prisma (35 models)
│   │   ├── migrations/   (13 migration files)
│   │   └── seed.ts       (Database seeding)
│   ├── package.json      (NestJS 10, Prisma 5, Swagger, Passport, bcrypt)
│   └── tsconfig.json
│
├── frontend/             (Next.js SPA, ~80 TypeScript/React files)
│   ├── src/
│   │   ├── app/          (18 pages: dashboard, login, employees, leave, etc.)
│   │   ├── components/   (UI: Button, Input, Modal, Table, Badge, etc.)
│   │   ├── context/      (AuthContext)
│   │   ├── hooks/        (useAuth, useGeolocation, usePagination)
│   │   ├── lib/          (axios.ts centralized instance)
│   │   ├── modules/      (Feature-specific components)
│   │   ├── services/     (12 service files, ~700 LOC)
│   │   ├── types/        (index.ts, 338 LOC, single source of truth)
│   │   ├── utils/        (RBAC, token, format, cn)
│   │   ├── locales/      (i18n: en.json, vi.json)
│   │   └── middleware.ts (Auth guard)
│   ├── public/           (PWA: manifest.json, sw.js, offline.html)
│   ├── package.json      (Next.js 16, React 19, TailwindCSS 4, Axios, i18next)
│   └── next.config.ts
│
├── docs/                 (Documentation)
│   ├── project-overview-pdr.md
│   ├── codebase-summary.md (this file)
│   ├── code-standards.md
│   ├── system-architecture.md
│   ├── deployment-guide.md
│   ├── design-guidelines.md
│   └── project-roadmap.md
│
├── plans/                (Development plans)
│   └── {date}-{slug}/
│       ├── plan.md
│       └── phase-XX-*.md
│
└── README.md (root)
```

---

## Backend Module Breakdown

| Module | Files | Purpose | Key Services |
|--------|-------|---------|--------------|
| auth | 5 | Login, JWT, roles | AuthService, JwtStrategy, RolesGuard |
| employee | 6 | Profiles, history | EmployeeService, UpdateEmployee DTO |
| leave | 8 | Requests, approvals | LeaveService, LeaveApprovalService, WorkflowEngine |
| attendance | 12 | Check-in/out, shifts, GPS | AttendanceService, ShiftService, LocationService |
| organization | 8 | Branches, depts, positions | OrganizationService |
| offboarding | 7 | Resignation, checklist | OffboardingService, OffboardingApprovalService |
| contract | 5 | Contract lifecycle | ContractService |
| calendar | 7 | Holidays, working days | CalendarService, HolidayService |
| audit | 4 | Change log | AuditService |
| workflow | 4 | Approval flow config | WorkflowService |
| office | 4 | Office locations, GPS | OfficeService |
| reward | 5 | Decisions, bonuses | RewardService |
| working-shift | 5 | Shift management | WorkingShiftService |
| me | 4 | User profile, password | MeService |
| notification | 2 | Telegram | NotificationService |
| system-config | 3 | Global settings | SystemConfigService |
| common | 4 | Filters, guards, decorators | HttpExceptionFilter, LoggingInterceptor |
| prisma | 2 | ORM | PrismaService, PrismaModule |

**Total Backend**: ~100 TypeScript files, ~1000 LOC per module avg

---

## Frontend Page & Component Breakdown

| Category | Files | Purpose |
|----------|-------|---------|
| **Pages (18)** | page.tsx files | dashboard, login, employees/[id], leave/[id], attendance, calendar, branches, departments, positions, working-shifts, offboarding, contracts, settings |
| **UI Components** | 10 | Button, Input, Card, Modal, Table, Pagination, Badge, Tabs, Alert, Spinner, Select |
| **Layout** | 3 | AppShell, Sidebar, Topbar |
| **Feature Modules** | 7 | auth, dashboard, employee, leave, attendance, offboarding, organization |
| **Services** | 12 | auth, employee, leave, attendance, offboarding, organization, contract, calendar, audit, working-shift |
| **Hooks** | 3 | useAuth, useGeolocation, usePagination |
| **Utils** | 4 | cn (classname), format, rbac, token |

**Total Frontend**: ~80 TypeScript/React files, ~3500 LOC total

---

## Prisma Models (35)

**Core Entities**:
- Employee, Branch, Department, Position, OfficeLocation

**Leave Management**:
- LeaveRequest, LeaveApproval, LeaveBalance, LeaveAccrualLog

**Attendance**:
- Attendance, AttendanceLog, AttendanceRaw, Shift, EmployeeShiftAssignment

**Offboarding**:
- ResignationRequest, ResignationApproval, OffboardingChecklist

**Organization**:
- WorkingShift

**Other**:
- Contract, Decision, EmployeeHistory, AuditLog, SystemConfig, ApprovalFlow, ApprovalStep, CalendarYear, CalendarDay, Holiday

---

## Key Statistics

| Metric | Value |
|--------|-------|
| Total Files (Repomix) | 264 |
| Total Tokens | 441,870 |
| Total Characters | 1,420,848 |
| Backend TypeScript | ~100 files |
| Frontend TypeScript/React | ~80 files |
| Database Migrations | 13 |
| Prisma Models | 35 |
| API Modules | 18 |
| Frontend Pages | 18 |
| UI Components | 10+ |

---

## Code Patterns & Conventions

### Backend (NestJS)

**Structure**:
```
module/
├── {module}.controller.ts      (HTTP routes, @Controller, @Post/@Get/@Put/@Delete)
├── {module}.service.ts         (Business logic, @Injectable)
├── {module}.module.ts          (Module imports, @Module)
└── dto/                        (Data validation, class-validator)
```

**Key Patterns**:
- Service layer (no business logic in controllers)
- DTO validation (class-validator, whitelist: true)
- Global ValidationPipe (forbidNonWhitelisted, transform: true)
- HttpExceptionFilter for consistent error responses
- LoggingInterceptor for all requests
- RolesGuard with @Roles() decorator
- @Public() decorator to bypass auth
- @CurrentUser() decorator for user extraction

**Response Format**:
```typescript
// List: paginated
{ data: T[], meta: { total, page, limit, totalPages } }

// Single/Action: raw
{ data: T } or { message: string }

// Error
{ statusCode, error, message, path, method, timestamp }
```

### Frontend (Next.js)

**Structure**:
```
pages/
├── page.tsx              (Page component)

components/
├── ui/                   (Reusable UI)
├── layout/               (AppShell, Sidebar, Topbar)
└── modules/              (Feature-specific)

services/
├── {module}.service.ts   (API calls via axios)

utils/
├── rbac.ts               (Role checking)
├── token.ts              (JWT handling)
├── format.ts             (Date, currency formatting)
└── cn.ts                 (Classname merging)

context/
└── AuthContext.tsx       (useAuth hook)
```

**Key Patterns**:
- Centralized axios instance with JWT interceptor
- AuthContext for session state
- Service layer for API calls
- Single types file (types/index.ts, source of truth)
- Loading, error, empty state handling in all pages
- RBAC utility functions (hasRole, hasMinRole, isAdmin, etc.)
- i18n for EN/VI locales

---

## Technology Versions

| Package | Version | Purpose |
|---------|---------|---------|
| **Backend** |
| NestJS | 10.3.0 | Framework |
| Prisma | 5.10.0 | ORM |
| TypeScript | 5.3.3 | Language |
| Passport | 0.7.0 | Auth |
| @nestjs/swagger | 7.3.0 | API docs |
| bcrypt | 5.1.1 | Password hashing |
| **Frontend** |
| Next.js | 16.2.1 | Framework |
| React | 19.2.4 | UI library |
| TailwindCSS | 4.x | Styling |
| Axios | 1.14.0 | HTTP client |
| i18next | 26.0.4 | i18n |
| TypeScript | 5.x | Language |

---

## Build & Run Commands

**Backend**:
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev      # Watch mode
npm run build          # Production build
npm run test           # Jest tests
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev            # Dev server (port 3001)
npm run build          # Production build
npm run lint           # ESLint
```

---

## Critical Files to Know

| File | Purpose |
|------|---------|
| `backend/src/main.ts` | Bootstrap: global config, Swagger setup |
| `backend/src/app.module.ts` | Module imports (18 total) |
| `backend/prisma/schema.prisma` | Database schema, 35 models |
| `backend/src/common/filters/http-exception.filter.ts` | Global error handler |
| `backend/src/auth/guards/jwt-auth.guard.ts` | JWT validation |
| `backend/src/auth/guards/roles.guard.ts` | RBAC enforcement |
| `frontend/src/lib/axios.ts` | Centralized HTTP client |
| `frontend/src/types/index.ts` | All TypeScript interfaces |
| `frontend/src/context/AuthContext.tsx` | Session state, useAuth hook |
| `frontend/src/utils/rbac.ts` | Role checking utilities |

---

## Documentation Files

| File | Coverage |
|------|----------|
| project-overview-pdr.md | Project goals, scope, stakeholders, modules |
| codebase-summary.md | This file — directory structure, stats |
| code-standards.md | Coding conventions, patterns, best practices |
| system-architecture.md | Architecture diagram, data flow, workflows |
| deployment-guide.md | How to run locally, env vars, DB setup |
| design-guidelines.md | UI patterns, colors, component usage |
| project-roadmap.md | Current status, phases, completion % |
| README.md | Quick start, tech stack, project structure |

---

## Next Steps for New Developers

1. Read `project-overview-pdr.md` (5 min)
2. Read `code-standards.md` for your stack (backend/frontend) (10 min)
3. Read `deployment-guide.md` and run locally (15 min)
4. Read `system-architecture.md` to understand workflows (10 min)
5. Start with small issues or review existing code patterns (30+ min)

**Total onboarding**: ~1 hour
