# Code Standards — HR Management System

Coding conventions for backend (NestJS) and frontend (Next.js). Enforce via linting before commit.

---

## General Principles

**YAGNI, KISS, DRY**: You Aren't Gonna Need It, Keep It Simple, File Size Limits: Keep individual code files under 200 LOC for optimal context management.

| Standard | Rule |
|----------|------|
| **Language** | TypeScript 5+ (strict: true, no any) |
| **Naming** | kebab-case files, camelCase variables, PascalCase classes |
| **File Size** | Max 200 LOC; split if larger |
| **Comments** | Only for "why", not "what" (code is self-documenting) |
| **Git Commits** | Conventional format: `feat:`, `fix:`, `docs:`, `test:`, `refactor:` |
| **Error Handling** | Try-catch + consistent error responses |
| **Secrets** | All via env vars; never commit .env or credentials |
| **Formatting** | Prettier (auto-format on save); ESLint strict |

---

## Backend Standards (NestJS)

### Directory Structure

```
src/
├── {module}/
│   ├── {module}.controller.ts    (HTTP routes, validation)
│   ├── {module}.service.ts       (Business logic)
│   ├── {module}.module.ts        (Module config)
│   ├── dto/
│   │   ├── create-{entity}.dto.ts
│   │   ├── update-{entity}.dto.ts
│   │   └── list-{entity}.dto.ts
│   └── {sub-service}.service.ts  (Optional: split services if >150 LOC)
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── dto/
├── prisma/
└── main.ts
```

### Naming Conventions

```typescript
// Files: kebab-case
create-employee.dto.ts
employee.controller.ts
employee.service.ts
employee.module.ts

// Classes: PascalCase
export class EmployeeService { }
export class CreateEmployeeDto { }
export class JwtAuthGuard { }

// Variables/Functions: camelCase
const employeeId = 1;
function calculateLeaveDays() { }
const findEmployeeById = async (id: number) => { };

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const JWT_EXPIRY = '24h';
```

### DTO (Data Transfer Objects)

Use class-validator + class-transformer:

```typescript
// create-employee.dto.ts
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsEnum(['admin', 'hr', 'manager', 'employee'])
  role: string = 'employee';

  @Type(() => Number)
  branchId?: number;
}
```

**Rules**:
- All input validated by DTO (whitelist: true prevents extra fields)
- Use class-validator decorators (@IsString, @IsEmail, etc.)
- Optional fields marked with @IsOptional()
- Enums with @IsEnum(['value1', 'value2'])
- Type coercion via @Type(() => Number)

### Controllers

Keep thin; delegate logic to services:

```typescript
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @Roles('admin', 'hr')
  async create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: any) {
    return { data: await this.employeeService.create(dto, user) };
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.employeeService.findById(id) };
  }

  @Get()
  async findAll(@Query() query: ListEmployeeDto) {
    const { data, total } = await this.employeeService.findAll(query);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
```

**Rules**:
- @Controller routes lowercase, kebab-case
- @Roles() before method (or class-wide with @UseGuards(RolesGuard))
- Always use @CurrentUser() decorator to get authenticated user (don't extract from request)
- Single endpoint does one thing (no GOD endpoints)
- Use ParseIntPipe, ParseBoolPipe for automatic type coercion
- Return consistent format: { data } or { data, meta }

### Services

Contain all business logic:

```typescript
@Injectable()
export class EmployeeService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto, user: any): Promise<Employee> {
    // Validate business logic
    const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!dept) throw new BadRequestException('Department not found');

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password ?? 'default', 12);

    // Create employee
    const employee = await this.prisma.employee.create({
      data: {
        ...dto,
        password: hashedPassword,
      },
    });

    // Log to AuditLog
    await this.prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entityType: 'Employee',
        entityId: employee.id,
        userId: user.id,
        changes: { created: employee },
        timestamp: new Date(),
      },
    });

    return employee;
  }

  async findById(id: number): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }
}
```

**Rules**:
- All mutations logged to AuditLog (action, entityType, entityId, userId, changes)
- Throw specific exceptions (BadRequestException, NotFoundException, UnauthorizedException)
- Use Prisma with typed queries
- No raw SQL (except for complex reports)
- Async/await (no Promises)
- Validate before mutation
- Return raw Prisma objects (controller handles response format)

### Error Handling

Global HttpExceptionFilter handles all exceptions:

```typescript
// Throw specific exceptions in services:
if (!employee) throw new NotFoundException('Employee not found');
if (dto.departmentId < 0) throw new BadRequestException('Invalid department');
if (user.role !== 'admin') throw new ForbiddenException('Insufficient permission');

// Global filter catches and returns consistent format:
// { statusCode: 404, error: 'Not Found', message: '...', path, method, timestamp }
```

**HTTP Status Codes**:
- `200`: GET success, no content
- `201`: POST success (resource created)
- `204`: DELETE success (no content)
- `400`: Validation error, bad request
- `401`: Unauthorized (no token or invalid)
- `403`: Forbidden (valid token, wrong role)
- `404`: Resource not found
- `409`: Conflict (duplicate email, etc.)
- `500`: Server error (log and alert)

### Prisma Usage

```typescript
// Find
const employee = await this.prisma.employee.findUnique({ where: { id: 1 } });
const employees = await this.prisma.employee.findMany({
  where: { departmentId: 1, isActive: true },
  include: { department: true, position: true },
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: 'desc' },
});

// Create/Update
const created = await this.prisma.employee.create({
  data: { fullName: 'John Doe', email: 'john@example.com', role: 'manager' },
  include: { department: true }, // Include relations
});

const updated = await this.prisma.employee.update({
  where: { id: 1 },
  data: { status: 'official' },
});

// Delete (soft: update status or archive date)
await this.prisma.employee.update({
  where: { id: 1 },
  data: { status: 'inactive' },
});

// Transaction
await this.prisma.$transaction([
  this.prisma.leaveRequest.update({ ... }),
  this.prisma.leaveBalance.update({ ... }),
]);
```

**Rules**:
- Always use `include` to fetch relations (prevents N+1 queries)
- Soft-delete via status field (never hard-delete)
- Use transactions for multi-entity mutations
- Paginate lists: skip & take
- Order by createdAt desc for lists

### Modules

Define dependencies and imports:

```typescript
@Module({
  imports: [PrismaModule, JwtModule], // Other modules
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService], // Re-export if other modules need
})
export class EmployeeModule {}
```

---

## Frontend Standards (Next.js)

### Directory Structure

```
src/
├── app/
│   ├── page.tsx                    (Dashboard)
│   ├── login/page.tsx
│   ├── employees/page.tsx
│   ├── employees/[id]/page.tsx
│   ├── layout.tsx                  (Root layout)
│   ├── globals.css
│   └── [other pages]/page.tsx
├── components/
│   ├── ui/                         (Reusable: Button, Input, Modal, etc.)
│   ├── layout/                     (AppShell, Sidebar, Topbar)
│   └── modules/                    (Feature-specific: EmployeeForm, LeaveTimeline)
├── context/
│   └── AuthContext.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useGeolocation.ts
│   └── usePagination.ts
├── lib/
│   └── axios.ts                    (Centralized HTTP client)
├── middleware.ts                   (Auth guard for routes)
├── services/
│   ├── auth.service.ts
│   ├── employee.service.ts
│   ├── leave.service.ts
│   └── [other services]
├── types/
│   └── index.ts                    (Single source of truth)
├── utils/
│   ├── rbac.ts                     (Role checking)
│   ├── token.ts                    (JWT handling)
│   ├── format.ts                   (Date, currency)
│   └── cn.ts                       (Classname helper)
└── locales/
    ├── en.json
    └── vi.json
```

### Naming Conventions

```typescript
// Files: kebab-case for components/services
CreateEmployeeModal.tsx
EmployeeAvatar.tsx
employee.service.ts
useGeolocation.ts

// Components: PascalCase
export const EmployeeForm: React.FC<Props> = ({ ... }) => { };

// Functions/Variables: camelCase
const handleSubmit = async () => { };
const [isLoading, setIsLoading] = useState(false);

// Constants: UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const API_TIMEOUT = 15000;

// i18n keys: dot-notation
"employee.form.title" // EN: "Employee Form", VI: "Mẫu Nhân Viên"
```

### Pages

Always handle loading, error, empty states:

```typescript
'use client'; // If needs client-side features

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { EmployeeService } from '@/services/employee.service';
import { EmployeeTable } from '@/modules/employee/EmployeeTable';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

export default function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const data = await EmployeeService.list();
        setEmployees(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Alert type="error">{error}</Alert>;
  if (!employees.length) return <Alert type="info">No employees found</Alert>;

  return (
    <div>
      <h1>Employees</h1>
      <EmployeeTable employees={employees} />
    </div>
  );
}
```

**Rules**:
- Always handle 3 states: loading, error, empty
- Use `useEffect` for data fetching (abort on unmount)
- Call services, not API directly
- useAuth() from context for user session
- Render early (loading → error → empty → data)

### Services

Centralized API calls:

```typescript
// services/employee.service.ts
import api from '@/lib/axios';
import { Employee, PaginatedResponse } from '@/types';

export const EmployeeService = {
  async list(page = 1, limit = 10): Promise<Employee[]> {
    const { data } = await api.get<PaginatedResponse<Employee>>('/employees', {
      params: { page, limit },
    });
    return data.data;
  },

  async getById(id: number): Promise<Employee> {
    const { data } = await api.get<{ data: Employee }>(`/employees/${id}`);
    return data.data;
  },

  async create(payload: CreateEmployeeDto): Promise<Employee> {
    const { data } = await api.post<{ data: Employee }>('/employees', payload);
    return data.data;
  },

  async update(id: number, payload: Partial<Employee>): Promise<Employee> {
    const { data } = await api.patch<{ data: Employee }>(`/employees/${id}`, payload);
    return data.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/employees/${id}`);
  },
};
```

**Rules**:
- Use centralized axios instance (`import api from '@/lib/axios'`)
- Never call fetch directly
- Return typed data (extract from response envelope)
- Handle 401 via axios interceptor (logout automatic)
- Services are object with methods (not classes)

### Types

Single source of truth in `types/index.ts`:

```typescript
// types/index.ts
export interface Employee {
  id: number;
  code: string;
  fullName: string;
  email: string;
  role: 'admin' | 'hr' | 'manager' | 'employee';
  branchId?: number;
  departmentId?: number;
  status: 'probation' | 'official' | 'resigned';
  createdAt?: string;
  updatedAt?: string;
  branch?: Pick<Branch, 'id' | 'name'>;
  department?: Pick<Department, 'id' | 'name' | 'code'>;
}

export interface CreateEmployeeDto {
  code?: string;
  fullName: string;
  email: string;
  role?: string;
  branchId?: number;
  departmentId?: number;
}

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'compensatory';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

// ... all interfaces here
```

**Rules**:
- One file for all types (prevent circular imports)
- Use `interface` for objects, `type` for unions/tuples
- Use `Pick<T, 'field'>` for partial relations
- Nullable fields: `field?: type | null`
- Match backend camelCase field names

### Components

Reusable, prop-driven:

```typescript
// components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}) => {
  const baseStyles = 'font-medium rounded transition-colors';
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  const sizes = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={loading}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
};
```

**Rules**:
- Accept props + spread HTMLAttributes
- variant/size props for flexibility
- Use `cn()` to merge Tailwind classes
- Keep under 100 LOC
- Document complex props with JSDoc

### Hooks

Reusable state logic:

```typescript
// hooks/useAuth.ts
import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};

// hooks/usePagination.ts
export const usePagination = (total: number, limit: number = 10) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    totalPages,
    goToPage: (p: number) => setPage(Math.max(1, Math.min(p, totalPages))),
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
  };
};
```

**Rules**:
- Custom hooks start with `use`
- Return object with named methods/state
- Validate context usage (throw if not wrapped)

### State Management

Use React Context + useState for simple apps (no Redux/Zustand):

```typescript
// context/AuthContext.tsx
'use client';

import { createContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '@/types';
import { getToken, removeToken } from '@/utils/token';
import { AuthService } from '@/services/auth.service';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const currentUser = await AuthService.me();
        setUser(currentUser);
      } catch {
        removeToken();
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: async (email, password) => {
          const { employee, accessToken } = await AuthService.login(email, password);
          setUser(employee);
          localStorage.setItem('token', accessToken);
        },
        logout: () => {
          setUser(null);
          removeToken();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
```

**Rules**:
- Mark Context component with `'use client'`
- Store JWT in localStorage, not state (persists across reloads)
- Verify token on app load via useEffect
- Provide hooks (useAuth) not raw context

### Styling

TailwindCSS only (no CSS-in-JS or separate CSS files):

```typescript
// Use Tailwind utility classes directly
<div className="flex items-center justify-between gap-4 p-6 bg-white rounded-lg shadow">
  <h2 className="text-xl font-bold text-gray-900">Employees</h2>
  <Button onClick={handleAdd}>Add Employee</Button>
</div>

// Use cn() helper for conditional classes
import { cn } from '@/utils/cn';

<div className={cn(
  'p-4 rounded',
  isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800',
)}>
  {title}
</div>

// Custom components encapsulate styles
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
```

**Rules**:
- No CSS files (use Tailwind)
- No styled-components (use Tailwind)
- Color system: indigo primary, gray neutral
- Consistent spacing: gap-2, gap-4, gap-6 (no random sizes)
- Responsive: `hidden md:block` for breakpoints

### i18n

Use i18next for EN/VI:

```typescript
// In component:
import { useTranslation } from 'react-i18next';

export const EmployeeForm = () => {
  const { t } = useTranslation();

  return (
    <form>
      <label>{t('employee.form.name')}</label>
      <input placeholder={t('employee.form.namePlaceholder')} />
      <button type="submit">{t('common.save')}</button>
    </form>
  );
};

// locales/en.json
{
  "employee": {
    "form": {
      "name": "Full Name",
      "namePlaceholder": "Enter full name",
      "email": "Email"
    }
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel"
  }
}

// locales/vi.json
{
  "employee": {
    "form": {
      "name": "Họ và Tên",
      "namePlaceholder": "Nhập họ và tên",
      "email": "Email"
    }
  },
  "common": {
    "save": "Lưu",
    "cancel": "Hủy"
  }
}
```

**Rules**:
- Key format: `domain.context.key` (e.g., `employee.form.name`)
- Never hardcode strings; use t()
- Vietnamese is default; English is secondary

---

## Pre-Commit Checklist

Before `git commit`:

**Backend**:
```bash
npm run lint              # ESLint fix
npm run format            # Prettier
npm test                  # Jest (required: 0 failures)
npm run build             # TypeScript compile check
```

**Frontend**:
```bash
npm run lint              # ESLint
npm run build             # Next.js build
```

**Both**:
```bash
git status                # No .env, node_modules, dist/
git diff --cached         # Review changes
```

---

## Common Patterns

### Loading List with Pagination

**Backend**:
```typescript
async findAll(query: ListEmployeeDto) {
  const { page = 1, limit = 10 } = query;
  const [data, total] = await Promise.all([
    this.prisma.employee.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.employee.count(),
  ]);
  return { data, total };
}
```

**Frontend**:
```typescript
const [page, setPage] = useState(1);
const { data, total } = await EmployeeService.list(page, limit);
const totalPages = Math.ceil(total / limit);
```

### RBAC Check

**Backend**:
```typescript
@Roles('admin', 'hr')
async deleteEmployee(@Param('id', ParseIntPipe) id: number) {
  return { data: await this.employeeService.delete(id) };
}
```

**Frontend**:
```typescript
import { hasRole } from '@/utils/rbac';
const { user } = useAuth();

if (hasRole(user?.role, 'admin')) {
  return <Button onClick={handleDelete}>Delete</Button>;
}
```

### Error Handling

**Backend**:
```typescript
try {
  const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id } });
} catch {
  throw new NotFoundException('Employee not found');
}
```

**Frontend**:
```typescript
try {
  const data = await service.list();
} catch (err) {
  setError(err instanceof Error ? err.message : 'Failed to load');
}
```

---

## Breaking Changes Protocol

When updating models, APIs, or types:

1. **Database**: Create new Prisma migration (prisma migrate dev)
2. **Backend API**: Add new endpoint or version (e.g., /v2/...)
3. **Frontend**: Update types/index.ts and services
4. **Documentation**: Update relevant docs + CHANGELOG.md
5. **Commit Message**: Include `BREAKING CHANGE:` prefix

Example:
```
feat(employee): add telegram notification preference

BREAKING CHANGE: Employee.notificationChannel renamed to Employee.telegramId.
Update frontend services to use new field name.
```

---

## File Size Management

**Target**: <200 LOC per file

| File Type | Threshold | Action |
|-----------|-----------|--------|
| Service | 150 LOC | Split into sub-services |
| Component | 100 LOC | Extract child components |
| Page | 80 LOC | Move logic to custom hooks |
| Controller | 60 LOC | Move logic to service |
| DTO | 50 LOC | Keep validators minimal |

Example refactor:
```typescript
// ❌ EmployeeService (250 LOC) — TOO BIG
export class EmployeeService {
  async create() { }
  async update() { }
  async delete() { }
  async calculateLeaveBalance() { }   // ← Move to LeaveBalanceService
  async approveReqFromManager() { }   // ← Move to LeaveApprovalService
}

// ✓ Split into focused services
export class EmployeeService { /* CRUD + profile */ }
export class LeaveBalanceService { /* Balance calculations */ }
export class LeaveApprovalService { /* Approval logic */ }
```

---

## Linting & Formatting

**Backend**: `.eslintrc.json` enforces:
- No unused variables
- Semicolons required
- 2-space indentation
- No `console.log` in production code

**Frontend**: ESLint + Prettier:
- Automatic format on save
- 2-space indentation
- Single quotes
- Semicolons

Run before commit:
```bash
npm run lint --fix        # Auto-fix
npm run format            # Prettier
```

---

## Testing Standards

**Backend**: Jest unit tests for services
```typescript
describe('EmployeeService', () => {
  it('should create an employee', async () => {
    const result = await service.create(dto);
    expect(result.id).toBeDefined();
  });
});
```

**Frontend**: Prefer manual testing + E2E (Cypress) for critical flows
```typescript
// cypress/e2e/login.cy.ts
describe('Login Flow', () => {
  it('should login and redirect to dashboard', () => {
    cy.visit('/login');
    cy.get('input[name="email"]').type('admin@example.com');
    cy.get('input[name="password"]').type('password123');
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/dashboard');
  });
});
```

---

## Performance Checklist

- [ ] Backend: Database queries use `include` (no N+1)
- [ ] Backend: Pagination for lists (skip & take)
- [ ] Frontend: Images optimized (<50KB)
- [ ] Frontend: Code-split pages (dynamic imports)
- [ ] Frontend: useCallback/useMemo for expensive computations
- [ ] Frontend: Memoized components if list rendering
- [ ] API calls: Debounce search (300ms)
- [ ] API calls: Cancel previous request on new search

---

## Security Checklist

- [ ] No secrets in code (use env vars)
- [ ] No hardcoded URLs (use NEXT_PUBLIC_API_URL)
- [ ] SQL injection prevented (use Prisma, not raw SQL)
- [ ] XSS prevented (React auto-escapes, no dangerouslySetInnerHTML)
- [ ] CSRF: POST/PUT/DELETE protected by JWT + SameSite cookie
- [ ] Rate limit: Consider for auth endpoints
- [ ] Audit log: All mutations tracked
- [ ] Password: Hashed with bcrypt (salt rounds: 12)
