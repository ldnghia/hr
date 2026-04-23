# HR Management System — Dcorp

## Project Overview
Full-stack HR system for Dcorp (~150 employees, 2 branches: HCM & HN).
Monorepo with NestJS backend, Next.js frontend, PostgreSQL via Prisma.

## Tech Stack
- **Backend**: NestJS 10, Prisma 5, PostgreSQL, JWT auth, Swagger
- **Frontend**: Next.js 16 (App Router), React 19, TailwindCSS 4, Axios, i18next
- **Roles**: admin, hr, manager, employee (RBAC)

## Project Structure
```
hr-project/
├── backend/    → NestJS API (port 3000)
├── frontend/   → Next.js App (port 3001)
└── mobile/     → (planned)
```

## Running the Project
```bash
# Backend
cd backend && npm install && npx prisma generate && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev
```

## Key Architecture Decisions
- Multi-step approval workflow (configurable via ApprovalFlow, not hardcoded)
- All employee field changes tracked in EmployeeHistory
- All mutations logged in AuditLog
- Attendance supports GPS check-in/out and Excel import
- No payroll module (out of scope)
- No external integrations except Telegram notifications

## Code Conventions
- Backend: Service layer pattern, no business logic in controllers
- Backend: Always return `{ data, message, statusCode }` format
- Frontend: Centralized Axios instance (`/lib/axios`), never use fetch
- Frontend: Always handle loading, error, and empty states
- Frontend: Store JWT in localStorage, attach via interceptor
- All code must be production-ready, clean, and scalable

## Database
- PostgreSQL via Prisma ORM
- Schema: `backend/prisma/schema.prisma`
- Seed: `backend/prisma/seed.ts`
- Never overwrite data — always store history

## Modules
auth, employee, leave, attendance, organization, offboarding, calendar,
contract, audit, workflow, working-shift, office, reward, me
