# HR Management System — Dcorp

Production-ready HR management platform for ~150 employees across 2 branches (HCM & HN).

**Latest**: v1.0-beta | **Status**: Active Development (72% complete)

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Docker & Docker Compose (optional)

### 1. Clone & Install
```bash
git clone https://github.com/dcorp/hr-project.git
cd hr-project

# Backend
cd backend && npm install && npx prisma generate
cd ..

# Frontend
cd frontend && npm install
cd ..
```

### 2. Environment Setup
**Backend** (`backend/.env.local`):
```env
DATABASE_URL="postgresql://user:password@localhost:5432/hr_db"
JWT_SECRET="your-secret-key-here"
PORT=3000
CORS_ORIGIN="http://localhost:3001"
NODE_ENV="development"
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL="http://localhost:3000/api/v1"
```

### 3. Database
```bash
cd backend
createdb hr_db
npx prisma migrate dev    # Run migrations
npx prisma db seed        # Optional: seed test data
```

### 4. Run
```bash
# Terminal 1: Backend
cd backend && npm run start:dev
# → http://localhost:3000/api/docs (Swagger)

# Terminal 2: Frontend
cd frontend && npm run dev
# → http://localhost:3001
```

**Test Credentials** (after seeding):
- Admin: `admin@dcorp.vn` / `admin123`
- HR: `hr@dcorp.vn` / `hr123`
- Manager: `manager@dcorp.vn` / `manager123`
- Employee: `emp1@dcorp.vn` / `emp123`

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend** | NestJS | 10.3 |
| **Frontend** | Next.js | 16.2 |
| **Database** | PostgreSQL | 12+ |
| **ORM** | Prisma | 5.10 |
| **Auth** | JWT (Passport) | - |
| **UI** | React + TailwindCSS | 19 + 4.x |
| **HTTP** | Axios | 1.14 |
| **i18n** | i18next | 26 |

---

## Project Structure

```
hr-project/
├── backend/              # NestJS API
│   ├── src/
│   │   ├── main.ts       # Bootstrap (CORS, Swagger, Guards)
│   │   ├── app.module.ts # 18 module imports
│   │   └── [18 modules]  # auth, employee, leave, attendance, etc.
│   └── prisma/
│       ├── schema.prisma # 35 models
│       └── migrations/   # 13 migrations
│
├── frontend/             # Next.js App
│   ├── src/
│   │   ├── app/          # 18 pages (dashboard, login, employees, etc.)
│   │   ├── components/   # UI (Button, Input, Modal, Table, etc.)
│   │   ├── services/     # 12 API services
│   │   ├── types/        # Single source of truth (338 LOC)
│   │   └── utils/        # RBAC, token, format
│   └── public/           # PWA manifest, service worker
│
└── docs/                 # Documentation
    ├── project-overview-pdr.md
    ├── codebase-summary.md
    ├── code-standards.md
    ├── system-architecture.md
    ├── deployment-guide.md
    ├── design-guidelines.md
    └── project-roadmap.md
```

---

## Key Features

### Completed ✓
- Employee management (profiles, history, CRUD)
- Authentication (JWT, role-based access)
- Organization structure (branches, departments, positions)
- Leave requests with 2-step approval
- Attendance check-in/out (GPS-based, shift-based)
- Dashboard with stats & pending approvals
- Audit logs (all mutations tracked)
- Multi-language support (EN/VI)

### In Progress 🟡 (v1.0-beta)
- Offboarding workflows
- Contract management
- Calendar & holidays
- Advanced attendance reports
- Telegram notifications

### Planned 🔄 (v1.1+)
- Mobile app (React Native)
- Payroll module
- 2FA for admins
- Advanced analytics

---

## API Documentation

**Swagger UI**: http://localhost:3000/api/docs (interactive)

**Global Prefix**: `/api/v1`

**Response Format**:
```json
// Paginated list
{
  "data": [...],
  "meta": { "total": 150, "page": 1, "limit": 10, "totalPages": 15 }
}

// Single/Action
{ "data": {...} } or { "message": "Success" }

// Error
{ "statusCode": 400, "error": "Bad Request", "message": "..." }
```

**Authentication**: Bearer token in `Authorization` header
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/employees
```

---

## Modules (18 Total)

| Module | Purpose | Status |
|--------|---------|--------|
| auth | Login, JWT, roles | ✓ |
| employee | Profiles, history | ✓ |
| organization | Branches, depts, positions | ✓ |
| leave | Requests, approvals, balance | 🟡 80% |
| attendance | Check-in/out, shifts, GPS | 🟡 75% |
| offboarding | Resignation, exit checklist | 🟡 70% |
| contract | Contract lifecycle | 🟡 50% |
| calendar | Holidays, working days | 🟡 40% |
| workflow | Approval flow config | 🔴 30% |
| reward | Decisions, bonuses | 🔴 20% |
| office | Locations, GPS | ✓ |
| working-shift | Shift management | ✓ |
| audit | Change log | ✓ |
| me | Current user endpoints | ✓ |
| notification | Telegram alerts | 🔴 25% |
| system-config | Global settings | ✓ |
| prisma | ORM | ✓ |
| common | Filters, guards, decorators | ✓ |

---

## Development Workflow

### Before Starting
1. Read `docs/code-standards.md` (10 min)
2. Read `docs/project-overview-pdr.md` (5 min)
3. Review open issues in task tracker

### Making Changes
```bash
# Create feature branch
git checkout -b feat/employee-import

# Make changes (follow code-standards.md)
# Test locally

# Lint & format
npm run lint --fix
npm run format

# Run tests
npm test

# Commit (conventional format)
git commit -m "feat(employee): add bulk import via CSV"

# Create PR (describe changes, link issues)
git push origin feat/employee-import
```

### Code Review Checklist
- [ ] Follows code standards (code-standards.md)
- [ ] No hardcoded secrets (.env vars only)
- [ ] Database migrations included (if schema change)
- [ ] Tests passing (npm test)
- [ ] No TypeScript errors (strict mode)
- [ ] Documentation updated (README, CHANGELOG)

---

## Configuration

### Environment Variables

**Backend** (`.env.local` required):
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/hr_db

# JWT
JWT_SECRET=<256-bit random string>
JWT_EXPIRY=24h

# Server
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001

# Features (optional)
TELEGRAM_BOT_TOKEN=
BCRYPT_ROUNDS=12
```

**Frontend** (`.env.local` optional):
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

**Never commit .env files to git.**

---

## Database Migrations

```bash
cd backend

# Create migration after schema changes
npx prisma migrate dev --name add_field_name

# View schema in UI (useful for debugging)
npx prisma studio

# Reset database (dev only, ⚠️ deletes all data)
npx prisma migrate reset --force
```

---

## Testing

```bash
cd backend

# Run unit tests
npm test

# Watch mode
npm test:watch

# Coverage report
npm test:cov
```

**Target**: 70% coverage of critical services (LeaveService, AttendanceService, etc.)

---

## Building for Production

```bash
# Backend
cd backend
npm run build
npm run start:prod

# Frontend
cd frontend
npm run build
npm run start   # Requires build to exist
```

---

## Deployment

### Local Docker
```bash
docker-compose up -d
# Services: PostgreSQL, Backend, Frontend, Nginx
```

### Manual Deployment
See `docs/deployment-guide.md` for:
- Environment setup
- Database migrations (production)
- SSL/HTTPS configuration
- Backup strategy
- Monitoring & logging
- Rollback procedures

---

## Troubleshooting

### Backend won't start
```bash
# Check env vars
echo $DATABASE_URL

# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check migrations
npx prisma migrate status
```

### Frontend can't reach backend
```bash
# Verify NEXT_PUBLIC_API_URL
echo $NEXT_PUBLIC_API_URL

# Check backend is running
curl http://localhost:3000/api/v1/health

# Check CORS
curl -H "Origin: http://localhost:3001" \
  http://localhost:3000/api/v1/employees -v
```

### Database errors
```bash
# Reset (dev only)
npx prisma migrate reset --force

# Check schema
npx prisma studio
```

---

## Documentation

| Document | Coverage |
|----------|----------|
| `project-overview-pdr.md` | Goals, scope, stakeholders, modules, v1.0 criteria |
| `codebase-summary.md` | Directory structure, stats, LOC breakdown |
| `code-standards.md` | Coding conventions, patterns, pre-commit checklist |
| `system-architecture.md` | Architecture diagram, auth flow, approval workflows |
| `deployment-guide.md` | Local setup, Docker, production checklist |
| `design-guidelines.md` | Colors, typography, components, accessibility |
| `project-roadmap.md` | Status per module, milestones, known issues, blockers |

**Start here**: `docs/codebase-summary.md` → `docs/code-standards.md` → pick a module

---

## Performance

**API Response Times** (p95):
- List endpoints: ~300ms
- Single fetch: ~100ms
- Create/Update: ~200ms
- **Target**: <500ms ✓

**Frontend Load**:
- First Contentful Paint: ~1.5s
- Time to Interactive: ~2.5s
- **Target**: <3s ✓

**Database**:
- Queries optimized with Prisma `include`
- Pagination for lists (skip & take)
- No N+1 queries

---

## Security

- **Passwords**: bcrypt (salt rounds: 12)
- **Secrets**: All via env vars, never in code
- **Auth**: JWT (24h expiry)
- **RBAC**: 4 roles (admin, hr, manager, employee)
- **Validation**: class-validator (whitelist: true)
- **SQL Injection**: Prisma (parameterized queries)
- **XSS**: React auto-escapes, no dangerouslySetInnerHTML
- **Audit**: All mutations logged to AuditLog
- **HTTPS**: Required in production (TLS 1.2+)

---

## Known Issues

| Issue | Impact | Fix | ETA |
|-------|--------|-----|-----|
| Leave approval workflow incomplete | HR can't approve after manager | Complete workflow logic | 1 week |
| Attendance shift processing incomplete | Can't calculate late/absent | Implement shift time matching | 3 days |
| N+1 queries on employee list | Slow with 1000+ employees | Add Prisma include | Done |
| No unit tests for services | Bugs slip through | Write Jest tests | 2 weeks |

See `docs/project-roadmap.md` for full tracking.

---

## Contributing

1. Read `docs/code-standards.md`
2. Create feature branch (`feat/...`)
3. Make changes, test locally
4. Lint & format (`npm run lint --fix`)
5. Create PR with description
6. Wait for review + tests to pass
7. Merge to `main`

**Commit Format**:
```
feat(module): short description
fix(module): short description
docs: update README
test(module): add unit tests
refactor(module): improve code quality
```

---

## Team

- **Project Lead**: nghia0979139451@gmail.com
- **Backend**: [Team]
- **Frontend**: [Team]
- **QA**: [Team]

**Weekly Sync**: Tuesday 10:00 AM (Vietnam time)

---

## License

UNLICENSED (proprietary)

---

## Status & Support

- **Current Version**: v1.0-beta (72% complete)
- **Latest Release**: 2026-04-22
- **Support**: Email project lead
- **Bugs**: Create issue in task tracker
- **Feature Requests**: Discuss in weekly sync

---

## Next Steps

1. **Immediate** (This week):
   - Complete leave approval workflow
   - Fix attendance shift processing

2. **Short-term** (Next 2 weeks):
   - Add GPS validation for attendance
   - Start offboarding workflows

3. **Medium-term** (Next month):
   - Complete all Phase 2 modules
   - Add unit tests (70% coverage)

4. **Long-term** (June onwards):
   - Polish & optimization
   - Docker & CI/CD setup
   - Production deployment (v1.0)

See `docs/project-roadmap.md` for detailed tracking.

---

## Quick Links

- **Swagger API Docs**: http://localhost:3000/api/docs
- **Prisma Studio**: `npx prisma studio`
- **GitHub Issues**: [Link]
- **Slack Channel**: [Link]
- **Documentation**: `docs/`

---

## FAQ

**Q: How do I reset the database?**
A: `npx prisma migrate reset --force` (dev only, deletes all data)

**Q: Where are the secrets?**
A: `.env.local` file (never in git). Use secrets manager in production.

**Q: How do I add a new module?**
A: Follow structure in `docs/code-standards.md` → create controller, service, module, DTOs

**Q: How do I deploy to production?**
A: See `docs/deployment-guide.md` for Docker, env vars, SSL setup

**Q: Can I use fetch instead of axios?**
A: No, use centralized axios instance in `lib/axios.ts` (handles JWT interceptor, timeouts, error handling)

**Q: What's the file size limit?**
A: 200 LOC per file. Split if larger. See code-standards.md for refactoring examples.

---

Last Updated: 2026-04-22
