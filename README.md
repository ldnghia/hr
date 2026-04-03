
```
hr-project
├─ .claude
│  ├─ commands
│  │  ├─ crud.md
│  │  ├─ debug.md
│  │  ├─ init.md
│  │  ├─ optimize.md
│  │  └─ workflow.md
│  ├─ context.md
│  ├─ settings.local.json
│  └─ system.md
├─ CHANGELOG.md
├─ backend
│  ├─ .claude
│  │  ├─ commands
│  │  │  ├─ crud.md
│  │  │  ├─ debug.md
│  │  │  ├─ init.md
│  │  │  ├─ optimize.md
│  │  │  └─ workflow.md
│  │  ├─ context.md
│  │  ├─ rules.md
│  │  ├─ settings.local.json
│  │  └─ system.md
│  ├─ CLAUDE.md
│  ├─ nest-cli.json
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ prisma
│  │  ├─ migrations
│  │  │  ├─ 20240101000000_init
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240102000000_leave_workflow_redesign
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240103000000_add_auth_and_leave_columns
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240104000000_add_audit_log_details
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240105000000_attendance_unique_and_processor
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240106000000_offboarding_workflow_and_history
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240107000000_add_office_location
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240108000000_add_office_gps_to_attendance
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240109000000_add_branch_gps
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20240110000000_add_attendance_location_note
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20250402000000_enhance_department_position
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20250402000001_enhance_shift_employee
│  │  │  │  └─ migration.sql
│  │  │  ├─ 20250403000000_add_working_shift_fields
│  │  │  │  └─ migration.sql
│  │  │  └─ migration_lock.toml
│  │  ├─ schema.prisma
│  │  └─ seed.ts
│  ├─ src
│  │  ├─ app.module.ts
│  │  ├─ attendance
│  │  │  ├─ attendance-processor.service.ts
│  │  │  ├─ attendance.controller.ts
│  │  │  ├─ attendance.module.ts
│  │  │  ├─ attendance.service.ts
│  │  │  ├─ dto
│  │  │  │  ├─ attendance-list.dto.ts
│  │  │  │  ├─ check-in-out.dto.ts
│  │  │  │  ├─ check-in.dto.ts
│  │  │  │  ├─ check-out.dto.ts
│  │  │  │  ├─ create-location.dto.ts
│  │  │  │  ├─ create-shift.dto.ts
│  │  │  │  ├─ import-attendance.dto.ts
│  │  │  │  └─ report-attendance.dto.ts
│  │  │  ├─ location.service.ts
│  │  │  └─ shift.service.ts
│  │  ├─ audit
│  │  │  ├─ audit.controller.ts
│  │  │  ├─ audit.module.ts
│  │  │  ├─ audit.service.ts
│  │  │  └─ dto
│  │  │     └─ audit-list.dto.ts
│  │  ├─ auth
│  │  │  ├─ auth.controller.ts
│  │  │  ├─ auth.module.ts
│  │  │  ├─ auth.service.ts
│  │  │  ├─ decorators
│  │  │  │  └─ public.decorator.ts
│  │  │  ├─ dto
│  │  │  │  ├─ change-password.dto.ts
│  │  │  │  └─ login.dto.ts
│  │  │  ├─ guards
│  │  │  │  ├─ jwt-auth.guard.ts
│  │  │  │  └─ roles.guard.ts
│  │  │  └─ strategies
│  │  │     └─ jwt.strategy.ts
│  │  ├─ calendar
│  │  │  ├─ calendar.controller.ts
│  │  │  ├─ calendar.module.ts
│  │  │  ├─ calendar.service.ts
│  │  │  ├─ dto
│  │  │  │  ├─ create-calendar-year.dto.ts
│  │  │  │  ├─ create-holiday.dto.ts
│  │  │  │  └─ update-calendar-day.dto.ts
│  │  │  └─ holiday.service.ts
│  │  ├─ common
│  │  │  ├─ decorators
│  │  │  │  ├─ current-user.decorator.ts
│  │  │  │  └─ roles.decorator.ts
│  │  │  ├─ dto
│  │  │  │  └─ pagination.dto.ts
│  │  │  ├─ filters
│  │  │  │  └─ http-exception.filter.ts
│  │  │  └─ interceptors
│  │  │     └─ logging.interceptor.ts
│  │  ├─ contract
│  │  │  ├─ contract.controller.ts
│  │  │  ├─ contract.module.ts
│  │  │  ├─ contract.service.ts
│  │  │  └─ dto
│  │  │     ├─ contract-list.dto.ts
│  │  │     └─ create-contract.dto.ts
│  │  ├─ employee
│  │  │  ├─ dto
│  │  │  │  ├─ admin-update-employee.dto.ts
│  │  │  │  ├─ change-password.dto.ts
│  │  │  │  ├─ create-employee.dto.ts
│  │  │  │  ├─ list-employee.dto.ts
│  │  │  │  └─ update-employee.dto.ts
│  │  │  ├─ employee.controller.ts
│  │  │  ├─ employee.module.ts
│  │  │  └─ employee.service.ts
│  │  ├─ leave
│  │  │  ├─ dto
│  │  │  │  ├─ action-leave.dto.ts
│  │  │  │  ├─ adjust-balance.dto.ts
│  │  │  │  ├─ create-leave-request.dto.ts
│  │  │  │  └─ list-leave-request.dto.ts
│  │  │  ├─ leave-approval.service.ts
│  │  │  ├─ leave-balance.service.ts
│  │  │  ├─ leave.controller.ts
│  │  │  ├─ leave.module.ts
│  │  │  ├─ leave.service.ts
│  │  │  └─ workflow-engine.service.ts
│  │  ├─ main.ts
│  │  ├─ me
│  │  │  ├─ dto
│  │  │  │  ├─ change-my-password.dto.ts
│  │  │  │  └─ update-me.dto.ts
│  │  │  ├─ me.controller.ts
│  │  │  └─ me.module.ts
│  │  ├─ offboarding
│  │  │  ├─ dto
│  │  │  │  ├─ approve-resignation.dto.ts
│  │  │  │  ├─ create-checklist-item.dto.ts
│  │  │  │  ├─ create-resignation.dto.ts
│  │  │  │  └─ process-resignation.dto.ts
│  │  │  ├─ offboarding-approval.service.ts
│  │  │  ├─ offboarding.controller.ts
│  │  │  ├─ offboarding.module.ts
│  │  │  └─ offboarding.service.ts
│  │  ├─ office
│  │  │  ├─ dto
│  │  │  │  └─ create-office.dto.ts
│  │  │  ├─ office.controller.ts
│  │  │  ├─ office.module.ts
│  │  │  └─ office.service.ts
│  │  ├─ organization
│  │  │  ├─ dto
│  │  │  │  ├─ create-branch.dto.ts
│  │  │  │  ├─ create-department.dto.ts
│  │  │  │  ├─ create-position.dto.ts
│  │  │  │  ├─ update-department.dto.ts
│  │  │  │  └─ update-position.dto.ts
│  │  │  ├─ organization.controller.ts
│  │  │  ├─ organization.module.ts
│  │  │  └─ organization.service.ts
│  │  ├─ prisma
│  │  │  ├─ prisma.module.ts
│  │  │  └─ prisma.service.ts
│  │  ├─ reward
│  │  │  ├─ dto
│  │  │  │  ├─ create-decision.dto.ts
│  │  │  │  └─ reward-list.dto.ts
│  │  │  ├─ reward.controller.ts
│  │  │  ├─ reward.module.ts
│  │  │  └─ reward.service.ts
│  │  ├─ workflow
│  │  │  ├─ dto
│  │  │  │  └─ create-flow.dto.ts
│  │  │  ├─ workflow.controller.ts
│  │  │  ├─ workflow.module.ts
│  │  │  └─ workflow.service.ts
│  │  └─ working-shift
│  │     ├─ dto
│  │     │  ├─ create-working-shift.dto.ts
│  │     │  └─ update-working-shift.dto.ts
│  │     ├─ working-shift.controller.ts
│  │     ├─ working-shift.module.ts
│  │     └─ working-shift.service.ts
│  ├─ tsconfig.build.json
│  └─ tsconfig.json
├─ frontend
│  ├─ .claude
│  │  ├─ commands
│  │  │  ├─ crud.md
│  │  │  ├─ debug.md
│  │  │  ├─ init.md
│  │  │  ├─ optimize.md
│  │  │  └─ workflow.md
│  │  ├─ context.md
│  │  ├─ rules.md
│  │  ├─ settings.local.json
│  │  └─ system.md
│  ├─ AGENTS.md
│  ├─ CLAUDE.md
│  ├─ README.md
│  ├─ certificates
│  │  ├─ dcorp.vn-key.pem
│  │  └─ dcorp.vn.pem
│  ├─ eslint.config.mjs
│  ├─ next-env.d.ts
│  ├─ next.config.ts
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ postcss.config.mjs
│  ├─ public
│  │  ├─ file.svg
│  │  ├─ globe.svg
│  │  ├─ icons
│  │  │  ├─ icon-maskable.svg
│  │  │  └─ icon.svg
│  │  ├─ manifest.json
│  │  ├─ next.svg
│  │  ├─ offline.html
│  │  ├─ sw.js
│  │  ├─ vercel.svg
│  │  └─ window.svg
│  ├─ scripts
│  │  └─ gen-cert.sh
│  ├─ server-https.mjs
│  ├─ src
│  │  ├─ app
│  │  │  ├─ Providers.tsx
│  │  │  ├─ api
│  │  │  │  └─ v1
│  │  │  │     └─ [...path]
│  │  │  │        └─ route.ts
│  │  │  ├─ attendance
│  │  │  │  └─ page.tsx
│  │  │  ├─ branches
│  │  │  │  └─ page.tsx
│  │  │  ├─ calendar
│  │  │  │  └─ page.tsx
│  │  │  ├─ dashboard
│  │  │  │  └─ page.tsx
│  │  │  ├─ departments
│  │  │  │  └─ page.tsx
│  │  │  ├─ employees
│  │  │  │  ├─ [id]
│  │  │  │  │  └─ page.tsx
│  │  │  │  └─ page.tsx
│  │  │  ├─ error.tsx
│  │  │  ├─ favicon.ico
│  │  │  ├─ globals.css
│  │  │  ├─ layout.tsx
│  │  │  ├─ leave
│  │  │  │  ├─ [id]
│  │  │  │  │  └─ page.tsx
│  │  │  │  └─ page.tsx
│  │  │  ├─ loading.tsx
│  │  │  ├─ login
│  │  │  │  └─ page.tsx
│  │  │  ├─ offboarding
│  │  │  │  └─ page.tsx
│  │  │  ├─ page.tsx
│  │  │  ├─ positions
│  │  │  │  └─ page.tsx
│  │  │  └─ working-shifts
│  │  │     └─ page.tsx
│  │  ├─ components
│  │  │  ├─ layout
│  │  │  │  ├─ AppShell.tsx
│  │  │  │  ├─ Sidebar.tsx
│  │  │  │  └─ Topbar.tsx
│  │  │  ├─ pwa
│  │  │  │  └─ ServiceWorkerRegistration.tsx
│  │  │  └─ ui
│  │  │     ├─ Alert.tsx
│  │  │     ├─ Badge.tsx
│  │  │     ├─ Button.tsx
│  │  │     ├─ Card.tsx
│  │  │     ├─ Input.tsx
│  │  │     ├─ Modal.tsx
│  │  │     ├─ Pagination.tsx
│  │  │     ├─ Select.tsx
│  │  │     ├─ Spinner.tsx
│  │  │     ├─ Table.tsx
│  │  │     └─ Tabs.tsx
│  │  ├─ context
│  │  │  └─ AuthContext.tsx
│  │  ├─ hooks
│  │  │  ├─ useAuth.ts
│  │  │  ├─ useGeolocation.ts
│  │  │  └─ usePagination.ts
│  │  ├─ lib
│  │  │  └─ axios.ts
│  │  ├─ middleware.ts
│  │  ├─ modules
│  │  │  ├─ auth
│  │  │  ├─ dashboard
│  │  │  ├─ employee
│  │  │  │  ├─ ChangePasswordModal.tsx
│  │  │  │  ├─ CreateEmployeeModal.tsx
│  │  │  │  ├─ EditEmployeeModal.tsx
│  │  │  │  ├─ EmployeeAvatar.tsx
│  │  │  │  ├─ EmployeeHistory.tsx
│  │  │  │  ├─ EmployeeProfile.tsx
│  │  │  │  └─ EmployeeTable.tsx
│  │  │  └─ leave
│  │  │     ├─ CreateLeaveModal.tsx
│  │  │     ├─ LeaveTimeline.tsx
│  │  │     ├─ PendingApprovals.tsx
│  │  │     └─ RejectModal.tsx
│  │  ├─ services
│  │  │  ├─ attendance.service.ts
│  │  │  ├─ audit.service.ts
│  │  │  ├─ auth.service.ts
│  │  │  ├─ calendar.service.ts
│  │  │  ├─ contract.service.ts
│  │  │  ├─ employee.service.ts
│  │  │  ├─ leave.service.ts
│  │  │  ├─ offboarding.service.ts
│  │  │  ├─ organization.service.ts
│  │  │  └─ working-shift.service.ts
│  │  ├─ types
│  │  │  └─ index.ts
│  │  └─ utils
│  │     ├─ cn.ts
│  │     ├─ format.ts
│  │     ├─ rbac.ts
│  │     └─ token.ts
│  ├─ tsconfig.json
│  └─ tsconfig.tsbuildinfo
├─ hr-project.code-workspace
├─ mobile
└─ prompt_mobile_wfm.md

```