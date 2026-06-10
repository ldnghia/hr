# System Architecture — HR Management System

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                   │
│  Pages: Dashboard, Employees, Leave, Attendance, etc.       │
│  - React 19 Components + TailwindCSS 4                      │
│  - AuthContext + useAuth Hook                               │
│  - 12 Service Layer (API calls)                             │
│  - Single types/index.ts (338 LOC, source of truth)         │
└────────────────────────┬────────────────────────────────────┘
                         │ Axios + JWT Interceptor
                         │ (15s timeout, auto-401 logout)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  NestJS API (Backend)                        │
│              Global Prefix: /api/v1                         │
│  - 18 Modules (Auth, Employee, Leave, Attendance, etc.)     │
│  - Service Layer (business logic)                           │
│  - DTO Validation (class-validator)                         │
│  - Global Filters (HttpExceptionFilter)                     │
│  - Global Interceptors (LoggingInterceptor)                 │
│  - JWT Auth + RolesGuard (RBAC)                             │
│  - Swagger UI at /api/docs                                  │
└────────────────────────┬────────────────────────────────────┘
                         │ Prisma ORM
                         │ (Type-safe queries)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database                             │
│  - 35 Prisma Models                                         │
│  - 13 Migrations (auto-versioned)                           │
│  - AuditLog (all mutations)                                 │
│  - EmployeeHistory (field changes)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Architecture

### Request → Response Cycle

```
Frontend (axios request)
    │
    ├─ Attach JWT token (interceptor)
    └─ POST /api/v1/employees (JSON body)
        │
        ▼
Backend (NestJS)
    │
    ├─ Route Handler (Controller)
    │   └─ Parse URL params + body
    │
    ├─ Global ValidationPipe
    │   └─ Validate DTO (class-validator)
    │   └─ Whitelist fields (forbidNonWhitelisted)
    │
    ├─ JwtAuthGuard
    │   └─ Verify Bearer token
    │   └─ Extract user (CurrentUser decorator)
    │
    ├─ RolesGuard
    │   └─ Check @Roles() permissions
    │   └─ Throw ForbiddenException if no access
    │
    ├─ Service (Business Logic)
    │   ├─ Validate business rules
    │   ├─ Query Prisma (with include relations)
    │   ├─ Create/Update/Delete via Prisma
    │   └─ Log to AuditLog
    │
    ├─ Response Format
    │   └─ { data: T } or { data, meta } for paginated
    │
    ├─ LoggingInterceptor
    │   └─ Log request + response
    │
    └─ Return to Frontend
        │
        ▼
Frontend (axios response)
    │
    ├─ Extract response.data (enum: 200 success, 401 logout, 4xx/5xx error)
    └─ Update UI state (data, loading, error)
```

---

## Authentication & Authorization Flow

### Traditional Login Flow (Email + Password)

```
1. User enters email + password
   └─ Frontend: POST /api/v1/auth/login { email, password }

2. Backend: AuthService
   ├─ Find employee by email
   ├─ Verify password (bcrypt.compare)
   ├─ Generate JWT (exp: 24h, HS256)
   └─ Return { accessToken, employee }

3. Frontend: AuthContext
   ├─ Save token to localStorage
   ├─ Set user in state
   └─ Redirect to /dashboard

4. Subsequent Requests: Axios Interceptor
   ├─ Read token from localStorage
   ├─ Attach "Authorization: Bearer {token}"
   └─ Send with every request

5. Backend: JwtAuthGuard
   ├─ Verify token signature + expiry
   ├─ Extract user.id from payload
   └─ Attach to request.user
```

### Google OAuth2 Login Flow

```
1. User clicks "Continue with Google" button
   └─ Frontend: Redirect to GET /api/v1/auth/google

2. Backend: GoogleAuthGuard + PassportJS
   ├─ Redirect to Google OAuth consent screen
   ├─ User authorizes scopes: [email, profile]
   ├─ Google redirects back to callback with code

3. Backend: GoogleStrategy (Passport)
   ├─ Exchange code for access/refresh tokens
   ├─ Fetch user profile from Google
   ├─ Extract email, googleId, displayName
   └─ Invoke GoogleAuthGuard.validate()

4. Backend: GET /api/v1/auth/google/callback
   ├─ Call AuthService.loginWithGoogle(profile)
   ├─ Find employee by EMAIL MATCH ONLY (no auto-registration)
   ├─ If not found → error: "not_registered"
   ├─ If found but disabled → error: "account_disabled"
   ├─ If found but different googleId → error: "account_conflict"
   ├─ If match → Update employee.googleId (link account)
   ├─ Generate JWT (exp: 24h, HS256)
   └─ Redirect to FRONTEND_OAUTH_REDIRECT_URL?token={jwt}

5. Frontend: /auth/callback page
   ├─ Extract token from query string
   ├─ If token present:
   │  ├─ Save to localStorage
   │  └─ Redirect to /dashboard
   └─ If error: Redirect to /login?error={code}

6. Subsequent Requests: Axios Interceptor (same as #4 above)

Key Differences from Traditional Login:
  ✓ Stateless OAuth2 (no server sessions needed)
  ✓ Links to existing employee by email only
  ✓ No auto-registration (explicit account creation required)
  ✓ Express-session middleware for CSRF state verification
  ✓ Redirect-based flow (no JSON responses in OAuth handshake)
```

### RBAC (Role-Based Access Control)

```
Roles (numeric hierarchy):
  admin = 4 (all permissions)
  hr    = 3 (leave approvals, employee management)
  manager = 2 (team attendance, approvals)
  employee = 1 (self-service only)

Example: Create Employee Endpoint
  @Roles('admin', 'hr')
  async create(@Body() dto: CreateEmployeeDto) { }

RolesGuard checks:
  ├─ Extract user.role from JWT
  ├─ Compare against @Roles() decorator
  ├─ Throw ForbiddenException if no match
  └─ Allow if role matches

Frontend RBAC (client-side hints only):
  import { hasRole } from '@/utils/rbac';
  if (hasRole(user?.role, 'admin')) {
    return <DeleteButton />;  // UI hint
  }
  // Backend still enforces (no trust client)
```

### Logout Flow

```
1. User clicks logout
   └─ Frontend: removeToken() + AuthContext.logout()

2. Frontend: Clear localStorage + Update state

3. If 401 Response (token expired):
   ├─ Axios interceptor detects 401
   ├─ Auto-logout (removeToken)
   └─ Redirect to /login

Note: OAuth2 logout requires no server cleanup (stateless JWTs).
      Clearing client-side token is sufficient.
```

---

## Multi-Step Approval Workflow

### Leave Request Approval (2-step: Manager → HR)

```
1. Employee creates LeaveRequest
   ├─ status = "pending"
   ├─ currentStep = 1
   └─ Insert LeaveApproval (step=1, approver=manager, status=pending)

2. Manager approves (step 1)
   ├─ Update LeaveApproval (step=1, status=approved, actionTime=now)
   ├─ Increment currentStep → 2
   ├─ Insert new LeaveApproval (step=2, approver=hr, status=pending)
   └─ Notify HR via Telegram (optional)

3. HR approves (step 2)
   ├─ Update LeaveApproval (step=2, status=approved, actionTime=now)
   ├─ Update LeaveRequest (status=approved, currentStep=3)
   ├─ Update LeaveBalance (decrement balance)
   └─ Notify Employee + Manager via Telegram

4. If any step rejects:
   ├─ Update LeaveApproval (status=rejected, comments=reason)
   ├─ Update LeaveRequest (status=rejected)
   └─ Notification to all parties

Workflow Config (ApprovalFlow):
  ├─ ApprovalFlow { id, entityType: "LEAVE", totalSteps: 2 }
  ├─ ApprovalStep { step: 1, approverRole: "manager", ... }
  └─ ApprovalStep { step: 2, approverRole: "hr", ... }

Benefits:
  ✓ Not hardcoded (configurable via API)
  ✓ Supports any number of steps
  ✓ Audit trail of each approval
```

### Resignation/Offboarding (Similar 2-step)

```
Employee submits resignation
  ├─ Create ResignationRequest (status=pending, currentStep=1)
  ├─ Insert ResignationApproval (step=1, approverRole=manager)
  └─ Create OffboardingChecklist (tasks for HR)

Manager approves
  ├─ Update ResignationApproval (step=1, status=approved)
  ├─ Insert ResignationApproval (step=2, approverRole=hr)

HR completes offboarding checklist + approves
  ├─ Update OffboardingChecklist (all items checked)
  ├─ Update ResignationApproval (step=2, status=approved)
  ├─ Update Employee (status=resigned, ... cleanup)
  └─ Archive employee data (never hard-delete)
```

---

## Database Schema (Simplified)

### Core Entities

```sql
Employee {
  id, code, fullName, email (unique), phone
  branchId, departmentId, positionId, managerId
  status (probation|official|resigned|inactive)
  role (admin|hr|manager|employee)
  joinDate, probationEndDate
  workingMode (FIXED|SHIFT), shiftId
  officeId, telegramId
  googleId (unique, nullable) - OAuth2 linking
  password (nullable after OAuth2)
  createdAt, updatedAt
}

Branch { id, name, latitude, longitude, radius }
Department { id, name, code, branchId, workingType (FIXED|SHIFT) }
Position { id, name, code, departmentId }
OfficeLocation { id, name, latitude, longitude, radius }
Shift { id, name, startTime, endTime, isCrossDay, departmentId }
```

### Leave Management

```sql
LeaveRequest {
  id, employeeId, fromDate, toDate
  type (annual|sick|unpaid|compensatory)
  status (pending|approved|rejected|cancelled)
  currentStep (tracks multi-step approval)
  days, isHalfDay, reason
  createdAt
}

LeaveApproval {
  id, requestId, step, approverId
  status (pending|approved|rejected)
  comments, actionTime
}

LeaveBalance {
  id, employeeId, type
  totalDays, usedDays, balance
  year
}

LeaveAccrualLog {
  id, employeeId, type
  accrualDays, reason, createdAt
}
```

### Attendance & Shifts

```sql
Attendance {
  id, employeeId, date
  checkInTime, checkOutTime
  checkInLocation (office|gps)
  checkOutLocation
  hoursWorked, status (present|absent|late|halfday)
  note
  createdAt
}

AttendanceLog { id, attendanceId, employeeId, action (CHECK_IN|CHECK_OUT), timestamp, location, gps, ... }
AttendanceRaw { id, rawData (Excel import), employeeId, processed }
EmployeeShiftAssignment { id, employeeId, shiftId, startDate, endDate }
```

### Offboarding

```sql
ResignationRequest {
  id, employeeId, resignationDate, reason
  status (pending|approved|rejected)
  currentStep, createdAt
}

ResignationApproval {
  id, requestId, step, approverId
  status (pending|approved|rejected)
  actionTime
}

OffboardingChecklist {
  id, resignationId
  items: [ { task, completedBy, completedAt } ]
}
```

### Audit & History

```sql
EmployeeHistory {
  id, employeeId, changedBy (userId)
  fieldName, oldValue, newValue
  changedAt
}

AuditLog {
  id, action (CREATE|UPDATE|DELETE), entityType, entityId
  userId (who), changes (JSON), timestamp
}

SystemConfig { key, value, description }
```

---

## API Response Formats

### Successful List Response (Paginated)

```json
{
  "data": [
    { "id": 1, "fullName": "John Doe", "email": "john@example.com" },
    { "id": 2, "fullName": "Jane Smith", "email": "jane@example.com" }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

### Successful Single Response

```json
{
  "data": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "manager",
    "department": {
      "id": 5,
      "name": "Engineering"
    }
  }
}
```

### Successful Action Response

```json
{
  "message": "Employee created successfully"
}
```

### Error Response (4xx/5xx)

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Email already exists",
  "path": "/api/v1/employees",
  "method": "POST",
  "timestamp": "2026-04-22T10:30:00Z"
}
```

---

## Attendance Check-In/Out Flow

### GPS-Based Check-In

```
1. Employee opens mobile (or web)
   └─ Request geolocation (browser API)

2. Frontend: useGeolocation hook
   ├─ Get current coordinates
   ├─ Calculate distance to nearest office
   └─ If distance < office.radius: allow check-in

3. POST /api/v1/attendance/check-in
   {
     "employeeId": 1,
     "checkInTime": "2026-04-22T08:00:00Z",
     "checkInLocation": "office",  // or "gps"
     "latitude": 10.7769,
     "longitude": 106.6967,
     "note": "Normal check-in"
   }

4. Backend: AttendanceService
   ├─ Validate employee + date (not already checked in)
   ├─ Validate geolocation (if gps mode)
   ├─ Create Attendance record
   ├─ Create AttendanceLog (audit)
   └─ Return { data: { id, checkInTime, ... } }

5. Frontend: Update UI
   └─ Show "Checked in at 08:00"

6. Check-Out (opposite flow)
```

### Shift-Based Attendance

```
Employee assigned to Shift { startTime: "08:00", endTime: "17:00" }

Check-in at 08:15
  ├─ On-time (within 30 min grace) → Present
  ├─ After 30 min → Late
  └─ After 2 hours → Absent

Check-out at 17:05
  ├─ Normal → Present (full day)

Attendance { 
  date, 
  checkInTime, 
  checkOutTime,
  hoursWorked = (checkOutTime - checkInTime) / 60 min,
  status = "present|late|halfday|absent"
}
```

### Excel Import (Batch)

```
1. Admin uploads Excel file
   └─ POST /api/v1/attendance/import { file }

2. Backend: AttendanceProcessorService
   ├─ Parse Excel (exceljs)
   ├─ Validate columns (date, employeeId, checkInTime, checkOutTime)
   ├─ Insert AttendanceRaw (unprocesed)
   ├─ Process rows:
   │  ├─ Create Attendance records
   │  ├─ Calculate hoursWorked, status
   │  └─ Create AttendanceLog
   └─ Return { processed: 150, failed: 0 }
```

---

## Deployment Architecture

### Local Development

```
Backend (NestJS)
  npm run start:dev
  Listens on http://0.0.0.0:3000
  Swagger at http://localhost:3000/api/docs

Frontend (Next.js)
  npm run dev
  Listens on http://0.0.0.0:3001
  API proxied via NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

Database (PostgreSQL)
  Running locally (docker or native)
  DATABASE_URL=postgresql://...
```

### Production (Containerized)

```
Docker Compose:
  ├─ PostgreSQL (primary database)
  ├─ Backend (NestJS container, port 3000)
  │  └─ Environment: DATABASE_URL, JWT_SECRET, CORS_ORIGIN
  ├─ Frontend (Next.js container, port 3001)
  │  └─ Environment: NEXT_PUBLIC_API_URL
  └─ Nginx Reverse Proxy (port 80/443)
     ├─ /api/v1 → Backend
     └─ / → Frontend

Backups:
  ├─ Daily PostgreSQL snapshots
  ├─ Offsite replication (S3 or similar)
```

---

## Performance Considerations

### Backend Optimization

| Issue | Solution |
|-------|----------|
| N+1 Queries | Use Prisma `include` for relations |
| Large Lists | Paginate (skip & take) |
| Slow Reports | Cache results (Redis) or separate query DB |
| JWT Validation | Cache decoded token for request duration |
| File Uploads | Stream to S3, not filesystem |

Example:
```typescript
// ❌ N+1: Loop with query
const employees = await prisma.employee.findMany();
for (const emp of employees) {
  const dept = await prisma.department.findUnique({ where: { id: emp.departmentId } });
}

// ✓ Optimized: Include relation
const employees = await prisma.employee.findMany({
  include: { department: true, position: true },
  skip: 0, take: 10,
});
```

### Frontend Optimization

| Issue | Solution |
|-------|----------|
| Large Bundle | Code-split pages (dynamic imports) |
| Slow API Calls | Debounce search (300ms) |
| Image Loading | Use Next.js Image component (lazy) |
| Render Loops | Memoize components + useCallback |
| State Updates | Cancel previous requests on new search |

---

## Security Architecture

### Data Protection

```
Passwords:
  ├─ Hashed with bcrypt (salt rounds: 12)
  ├─ Never logged or returned in API
  └─ Changed via dedicated endpoint (change-password)

Secrets:
  ├─ JWT_SECRET: 256-bit random, env var only
  ├─ DATABASE_URL: Encrypted in secrets manager
  ├─ API Keys: Never in code
  └─ Never hardcode credentials

Audit Trail:
  ├─ AuditLog: All mutations (POST/PUT/PATCH/DELETE)
  ├─ EmployeeHistory: All field changes
  └─ Immutable (no update/delete of audit records)
```

### API Security

```
Authentication:
  ├─ Traditional JWT (Bearer token in Authorization header)
  │  ├─ Expiry: 24 hours (configurable)
  │  └─ Signature: HS256
  │
  └─ OAuth2 (Google)
     ├─ PassportJS handles Google OAuth2 flow
     ├─ Redirect-based (not API-based)
     ├─ CSRF state verification via express-session
     ├─ Account linking by email match only
     └─ Returns JWT after linking (stateless)

Authorization (RBAC):
  ├─ Guards enforce @Roles() decorators
  ├─ 4 roles: admin > hr > manager > employee
  ├─ Permissions per endpoint
  └─ No implicit escalation

Rate Limiting:
  ├─ Consider for auth endpoints (login: 5 req/min)
  ├─ Search endpoints: 10 req/min per user
  └─ File uploads: 1 req per 10 sec

CORS:
  ├─ Configured via env var (CORS_ORIGIN)
  ├─ Default: '*' (dev), specific domains (prod)
  └─ Methods: GET, POST, PUT, PATCH, DELETE

HTTPS:
  ├─ Required in production (especially for OAuth2)
  ├─ TLS 1.2+
  └─ HSTS header: max-age=31536000

OAuth2 Security:
  ├─ Google Client ID/Secret in env vars only (never hardcoded)
  ├─ Callback URL must match Google Console configuration
  ├─ State parameter prevents CSRF attacks (via express-session)
  ├─ Session Secret must be strong (32+ bytes)
  └─ No account auto-registration (manual creation only)
```

### Input Validation

```
DTOs (class-validator):
  ├─ @IsString(), @IsEmail(), @IsEnum()
  ├─ Whitelist mode (forbidNonWhitelisted: true)
  ├─ Transform (enableImplicitConversion: true)
  └─ Rejects extra fields

SQL Injection Prevention:
  ├─ Always use Prisma (never raw SQL)
  ├─ Parameterized queries (automatic)
  └─ ORM handles escaping

XSS Prevention:
  ├─ React auto-escapes by default
  ├─ Never use dangerouslySetInnerHTML
  └─ Sanitize rich text (if needed)
```

---

## Notification System (Optional)

### Telegram Alerts

```
Flow:
  1. Employee creates LeaveRequest
  2. Backend notifies manager via Telegram
     └─ POST /api/v1/notification/send-telegram
  3. Manager approves via API (not Telegram)
  4. Backend notifies HR
  5. HR approves, Backend notifies Employee

Service:
  ├─ NotificationService (wrapper)
  ├─ TelegramService (bot integration)
  ├─ template: Leave request pending approval from {manager}
  └─ Link: dashboard for action

Required:
  ├─ TELEGRAM_BOT_TOKEN (env var)
  ├─ TELEGRAM_CHAT_ID (per user, optional)
  └─ Optional feature (skip if not configured)
```

---

## Monitoring & Logging

### Application Logs

```
LoggingInterceptor captures:
  ├─ Request: method, url, params, body (non-sensitive)
  ├─ Response: status, duration
  ├─ User: from JWT (anonymized)
  ├─ Timestamp: ISO 8601
  └─ Format: JSON (for aggregation)

Severity Levels:
  ├─ DEBUG: Development only
  ├─ INFO: Normal operations
  ├─ WARN: Recoverable errors
  └─ ERROR: Failures requiring attention
```

### Performance Metrics

```
Track:
  ├─ API response times (p50, p95, p99)
  ├─ Database query times
  ├─ Error rate (4xx, 5xx)
  ├─ Concurrent users
  └─ Disk/memory usage
```

---

## Disaster Recovery

### Backup Strategy

```
Daily:
  ├─ PostgreSQL dump (full backup)
  ├─ Upload to S3 (encrypted, versioned)
  ├─ Retention: 30 days
  └─ Recovery time: <1 hour

Weekly:
  ├─ Full snapshot (infrastructure)
  ├─ Test restore procedure
  └─ Document runbook

Monthly:
  ├─ Disaster recovery drill
  ├─ Verify backup integrity
  └─ Update RTO/RPO targets
```

### Failover Plan

```
If primary database down:
  ├─ Promote read-replica (if configured)
  ├─ Or restore from latest backup
  ├─ Update DATABASE_URL (env var)
  ├─ Restart backend
  └─ Notify users (maintenance window)

If backend down:
  ├─ Restart container
  ├─ Check logs for root cause
  ├─ If persistent: deploy previous version
  └─ Rollback via git tag + docker image
```

---

## Technology Decision Log

| Decision | Rationale |
|----------|-----------|
| NestJS | Strong RBAC, decorators, built-in guards |
| Prisma | Type-safe ORM, migrations, seed support |
| PostgreSQL | ACID compliance, JSON support, free |
| Next.js | SSR optional, full-stack, API routes fallback |
| TailwindCSS | Utility-first, no CSS files, responsive |
| JWT | Stateless, no session storage, portable |
| Bcrypt | Industry standard, configurable salt rounds |
| i18next | Flexible, no vendor lock-in, many locales |
| Telegram | Low-cost notifications, optional integration |
