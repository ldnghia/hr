# Project Roadmap — HR Management System

---

## Current Status: v1.0 (In Active Development)

**Last Updated**: April 22, 2026

Overall Completion: **72%**

---

## Phase Timeline

```
Phase 1: Foundation & Core Features (70% complete)
├─ Setup & Tooling ✓
├─ Database Schema & Migrations ✓
├─ Authentication & RBAC ✓
├─ Employee Management ✓
├─ Organization (Branches, Depts, Positions) ✓
├─ Leave Management (In Progress: 80%)
└─ Attendance (In Progress: 75%)

Phase 2: Advanced Features (40% complete)
├─ Offboarding / Resignation (70% complete)
├─ Contracts (50% complete)
├─ Calendar & Holidays (40% complete)
├─ Workflow Engine (30% complete)
├─ Rewards & Decisions (20% complete)
└─ Notifications (Telegram, 25% complete)

Phase 3: Polish & Deployment (10% complete)
├─ Testing & QA
├─ Performance Optimization
├─ Security Hardening
├─ Documentation
├─ Docker & CI/CD
└─ Production Deployment
```

---

## Detailed Module Status

### Phase 1: Foundation (70% Complete)

| Module | Status | Completion | Owner | Notes |
|--------|--------|-----------|-------|-------|
| **Auth** | ✓ Complete | 100% | Backend | Login (email+pwd), Google OAuth2, JWT, roles working |
| **Employee** | ✓ Complete | 100% | Backend | CRUD, history tracking, profiles |
| **Organization** | ✓ Complete | 100% | Backend | Branches, departments, positions |
| **Leave** | 🟡 In Progress | 80% | Backend | Requests ✓, Approvals (70%), Balance (75%) |
| **Attendance** | 🟡 In Progress | 75% | Backend | Check-in/out ✓, Shifts (70%), GPS (80%) |
| **Common/Filters** | ✓ Complete | 100% | Backend | Global validation, exceptions, interceptors |
| **Prisma** | ✓ Complete | 100% | Backend | 35 models, 13 migrations |
| **Frontend - Auth** | ✓ Complete | 100% | Frontend | Login, context, protected routes |
| **Frontend - Employee** | ✓ Complete | 100% | Frontend | List, create, edit, profiles |
| **Frontend - Dashboard** | ✓ Complete | 100% | Frontend | Overview, stats, pending approvals |

### Phase 2: Advanced Features (40% Complete)

| Module | Status | Completion | Owner | Notes |
|--------|--------|-----------|-------|-------|
| **Offboarding** | 🟡 In Progress | 70% | Backend | Resignation ✓, Approvals (60%), Checklist (70%) |
| **Contract** | 🟡 In Progress | 50% | Backend | Models ✓, CRUD (50%), Expiry tracking (30%) |
| **Calendar** | 🟡 In Progress | 40% | Backend | Holiday management (30%), Business day calc (50%) |
| **Workflow Engine** | 🔴 Not Started | 30% | Backend | Approval flow config (20%), Dynamic steps (0%) |
| **Reward** | 🔴 Not Started | 20% | Backend | Decision models ✓, CRUD (40%), Bonuses (0%) |
| **Notifications** | 🔴 Not Started | 25% | Backend | Telegram integration (25%), Email (0%) |
| **Working Shift** | ✓ Complete | 100% | Backend | Shift CRUD, assignment working |
| **Office** | ✓ Complete | 100% | Backend | Location management, GPS radius |
| **Frontend - Leave** | 🟡 In Progress | 70% | Frontend | Request form ✓, Timeline (70%), Approvals UI (50%) |
| **Frontend - Attendance** | 🟡 In Progress | 60% | Frontend | Check-in UI ✓, History (70%), Reports (30%) |
| **Frontend - Offboarding** | 🔴 Not Started | 20% | Frontend | Resignation form (30%), Checklist UI (10%) |

### Phase 3: Polish & Deployment (10% Complete)

| Task | Status | Completion | Owner | Notes |
|------|--------|-----------|-------|-------|
| **Unit Tests** | 🔴 Not Started | 5% | Backend | Critical services only |
| **E2E Tests** | 🔴 Not Started | 0% | QA | Login, leave, approval flows |
| **Performance** | 🟡 In Progress | 15% | DevOps | API responses <500ms (80%), Frontend load <3s (20%) |
| **Security** | 🟡 In Progress | 20% | Security | No hardcoded secrets ✓, SQL injection prevention ✓, XSS (0%) |
| **Documentation** | 🟡 In Progress | 60% | Tech Writer | API docs ✓, Architecture (90%), Deployment guide (80%) |
| **Docker & CI/CD** | 🔴 Not Started | 10% | DevOps | Dockerfile (30%), docker-compose (40%), GitHub Actions (0%) |
| **Code Review** | 🟡 In Progress | 50% | Team | Reviewed 50% of PRs, standards applied |

---

## v1.0 Release Goals

### Must Have (MVP)

- [x] Employee management (CRUD, profiles, history)
- [x] Authentication (JWT, roles)
- [x] Leave requests & approvals (2-step)
- [x] Attendance check-in/out
- [x] Dashboard with stats
- [ ] Full documentation (docs/ complete)
- [ ] Production-ready code (linted, typed, no warnings)
- [ ] Database backup strategy

### Should Have

- [ ] Offboarding workflow (resignation)
- [ ] Contract tracking
- [ ] Telegram notifications
- [ ] Calendar with holidays
- [ ] Performance optimizations

### Nice to Have

- [ ] Mobile app (v1.1)
- [ ] Advanced reporting
- [ ] Payroll integration
- [ ] 2FA for admins

---

## Detailed Milestones

### Milestone 1: Core Features ✓ (Complete)
**Target**: April 1, 2026 | **Actual**: April 8, 2026

- [x] Database design & migrations
- [x] Auth module (JWT, roles, guards)
- [x] Employee CRUD
- [x] Organization structure (branches, depts, positions)
- [x] Frontend login & dashboard
- [x] Role-based UI

**Completion**: 100% ✓

### Milestone 2: Leave & Attendance 🟡 (In Progress)
**Target**: May 15, 2026 | **ETA**: May 20, 2026

- [x] Leave request creation
- [x] Multi-step approval workflow
- [x] Leave balance tracking
- [x] Attendance check-in API
- [ ] GPS validation
- [ ] Shift-based attendance processing
- [ ] Leave calendar UI
- [ ] Attendance reports

**Completion**: 75% (pending: GPS, reports, shift processing)

**Blockers**: None

**Next**: Complete shift processing, add GPS validation, finish reports

### Milestone 3: Offboarding & Advanced 🔴 (Backlog)
**Target**: June 30, 2026 | **ETA**: July 15, 2026

- [ ] Resignation workflow
- [ ] Offboarding checklist
- [ ] Contract management
- [ ] Calendar & holidays
- [ ] Workflow engine (configurable approval flows)
- [ ] Reward & decision tracking
- [ ] Telegram notifications

**Completion**: 20% (only models, no logic)

**Blockers**: Waiting for leave/attendance completion

**Dependencies**: Milestone 2 must be 90% complete

### Milestone 4: Testing & Deployment 🔴 (Backlog)
**Target**: August 31, 2026 | **ETA**: September 15, 2026

- [ ] Unit tests (backend services)
- [ ] E2E tests (critical workflows)
- [ ] Load testing (1000+ concurrent users)
- [ ] Security audit
- [ ] Docker setup
- [ ] CI/CD pipeline
- [ ] Production deployment
- [ ] Monitoring & logging

**Completion**: 0%

**Blockers**: Waiting for Milestone 3 completion

**Dependencies**: All features must be feature-complete

### Milestone 5: Documentation & Polish 🔴 (Backlog)
**Target**: September 30, 2026 | **ETA**: October 15, 2026

- [ ] API documentation (Swagger complete)
- [ ] User guides
- [ ] Admin runbooks
- [ ] Code cleanup (no TODOs)
- [ ] Performance tuning
- [ ] Security hardening
- [ ] Launch preparation

**Completion**: 0%

**Blockers**: Depends on all features

---

## Feature Tracking

### Authentication Module

| Feature | Status | Backend | Frontend | Tests | Notes |
|---------|--------|---------|----------|-------|-------|
| Traditional login (email+password) | ✓ | ✓ | ✓ | - | Working end-to-end |
| Google OAuth2 login | ✓ | ✓ | ✓ | - | Redirect-based, email-link only |
| JWT generation & validation | ✓ | ✓ | ✓ | - | 24h expiry, HS256 signature |
| Role-based access control | ✓ | ✓ | ✓ | - | 4 roles: admin, hr, manager, employee |
| Account linking (OAuth2) | ✓ | ✓ | ✓ | - | Links by email match, prevents duplicate registration |
| Error codes (OAuth2) | ✓ | ✓ | ✓ | - | not_registered, account_disabled, account_conflict, oauth_failed |

### Leave Module

| Feature | Status | Backend | Frontend | Tests | Notes |
|---------|--------|---------|----------|-------|-------|
| Create leave request | ✓ | ✓ | ✓ | - | Allows selecting dates, type, reason |
| 2-step approval (Manager→HR) | 🟡 | 70% | 50% | - | Manager approve works, HR approve pending |
| Leave balance | ✓ | ✓ | 80% | - | Tracked per type, accrual logs exist |
| Half-day leaves | 🟡 | ✓ | 70% | - | Backend support, UI partial |
| Leave calendar view | 🔴 | 50% | 20% | - | Component exists, not integrated |
| Leave history | ✓ | ✓ | 70% | - | Shows approval timeline |
| Reject with comments | 🟡 | ✓ | 50% | - | Backend ready, UI needs work |
| Notification (approval pending) | 🔴 | 0% | N/A | - | Service placeholder only |

### Attendance Module

| Feature | Status | Backend | Frontend | Tests | Notes |
|---------|--------|---------|----------|-------|-------|
| GPS check-in/out | 🟡 | 80% | 60% | - | API validates radius, UI shows geolocation |
| Shift assignment | ✓ | ✓ | 80% | - | Employees assigned to shifts |
| Shift-based processing | 🟡 | 70% | N/A | - | Calculates on-time, late, absent status |
| Attendance history | ✓ | ✓ | 70% | - | Shows daily check-in/out |
| Excel import | ✓ | ✓ | 60% | - | Upload + parse, processing pending |
| Attendance report | 🔴 | 30% | 10% | - | Data exists, no report page |
| Location note | ✓ | ✓ | 70% | - | Employees can note reason for remote work |

### Offboarding Module

| Feature | Status | Backend | Frontend | Tests | Notes |
|---------|--------|---------|----------|-------|-------|
| Resignation request | 🟡 | 70% | 30% | - | Models exist, form pending |
| Manager approval | 🟡 | 60% | 20% | - | Service logic incomplete |
| HR approval | 🔴 | 30% | 0% | - | Not started |
| Exit checklist | 🟡 | 70% | 20% | - | Model exists, UI not integrated |
| Data archival | 🔴 | 20% | N/A | - | Plan exists, not implemented |

---

## Known Issues & Technical Debt

### High Priority (Sprint Next)

1. **Leave approval workflow not fully tested**
   - Status: Backend 70%, Frontend 50%
   - Impact: HR cannot approve leave after manager
   - Fix: Complete workflow logic, add e2e test
   - ETA: 1 week

2. **Attendance shift processing incomplete**
   - Status: 70%
   - Impact: Cannot calculate late/absent status
   - Fix: Implement shift time matching, duration calc
   - ETA: 3 days

3. **No error handling in attendance GPS**
   - Status: 0%
   - Impact: GPS failures crash endpoint
   - Fix: Add try-catch, fallback logic
   - ETA: 2 days

### Medium Priority (Sprint +2)

4. **Telegram notifications not integrated**
   - Status: 25%
   - Impact: No real-time alerts for approvers
   - Fix: Complete notification service, add telegram bot
   - ETA: 2 weeks

5. **Performance: N+1 queries on employee list**
   - Status: Identified
   - Impact: Page slow with 1000+ employees
   - Fix: Add Prisma `include`, pagination
   - ETA: 3 days

6. **No unit tests for critical services**
   - Status: 0%
   - Impact: Bugs slip through
   - Fix: Write Jest tests for LeaveService, AttendanceService
   - ETA: 2 weeks

### Low Priority (v1.1)

7. **Mobile app not started**
   - Status: 0%
   - Impact: Limited mobile access
   - Fix: Plan React Native or Flutter app
   - ETA: v1.1 (July 2026)

8. **Payroll module out of scope**
   - Status: N/A
   - Impact: HR uses separate system
   - Fix: Plan integration for v1.2
   - ETA: v1.2 (Sept 2026)

---

## Dependencies & Blockers

### Current Blockers

None critical. All active development on track.

### Dependency Graph

```
Milestone 1 (Foundation)
  └─ Auth ✓
  └─ Employee ✓
  └─ Organization ✓
  └─ Frontend (Dashboard, Auth) ✓
       └─ Milestone 2 (Leave & Attendance)
            ├─ Leave Module 🟡
            ├─ Attendance Module 🟡
            └─ Milestone 3 (Advanced)
                 ├─ Offboarding (depends on approval workflow)
                 ├─ Contracts
                 ├─ Calendar
                 ├─ Workflow Engine (depends on leave approval)
                 ├─ Rewards
                 └─ Notifications
                      └─ Milestone 4 (Testing & Deployment)
                           ├─ Unit Tests
                           ├─ E2E Tests
                           ├─ Security Audit
                           ├─ Docker & CI/CD
                           └─ Milestone 5 (Documentation & Polish)
                                └─ Production Launch v1.0
```

---

## Resource Allocation

### Backend Team (2 developers)

**Sprint Current** (Apr 22 - May 6):
- Dev 1: Leave approval workflow (Manager→HR 2-step)
- Dev 2: Attendance shift processing + GPS validation

**Sprint +1** (May 6 - May 20):
- Dev 1: Offboarding resignation workflow
- Dev 2: Calendar & holiday management

### Frontend Team (1 developer)

**Sprint Current** (Apr 22 - May 6):
- Leave request form & approval UI
- Attendance check-in UI improvements

**Sprint +1** (May 6 - May 20):
- Leave calendar view
- Attendance reports page

### QA/Testing (1 person, part-time)

**Ongoing**:
- Manual testing of leave/attendance workflows
- Bug reporting & verification

---

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API uptime | 99.5% | 99.8% | ✓ Exceeding |
| API response time (p95) | <500ms | ~350ms | ✓ Exceeding |
| Frontend load time | <3s | ~2.5s | ✓ Exceeding |
| Test coverage (backend) | 70% | 40% | 🟡 Below target |
| Code quality (ESLint errors) | 0 | 3 | 🟡 Minor issues |
| Documentation coverage | 100% | 75% | 🟡 In progress |
| User acceptance | >90% | TBD | - Not yet measured |

---

## v1.1 Roadmap (Future)

**Target Release**: July 2026

- [ ] Mobile app (React Native or Flutter)
- [ ] 2FA for admin accounts
- [ ] Advanced leave reports
- [ ] Payroll integration (basic)
- [ ] Department-level approvals
- [ ] Bulk employee import
- [ ] Custom approval workflows (non-hardcoded)
- [ ] Performance dashboard

---

## v1.2 Roadmap (Future)

**Target Release**: September 2026

- [ ] Full payroll module
- [ ] Tax calculations
- [ ] Bank integration
- [ ] Multi-company support
- [ ] Multi-language UI (3+ languages)
- [ ] GraphQL API option
- [ ] Advanced analytics

---

## How to Update This Roadmap

1. At end of each sprint, update completion %
2. Move completed items to ✓
3. Update blockers & risks
4. Adjust ETA if delays
5. Commit changes to git
6. Share with stakeholders

Example:
```markdown
### Milestone 2: Leave & Attendance 🟡 (75% → 80%)
**Updated**: April 25, 2026
- Shift processing: 70% → 75% (GPS validation completed)
- Attendance reports: 10% → 30% (UI started)
- New blocker: Time zone handling for global employees (TBD)
```

---

## Contact & Questions

- **Project Lead**: nghia0979139451@gmail.com
- **Backend Lead**: [Backend Team]
- **Frontend Lead**: [Frontend Team]
- **QA Lead**: [QA Team]

Weekly sync: Tuesday 10:00 AM (Vietnam time)
