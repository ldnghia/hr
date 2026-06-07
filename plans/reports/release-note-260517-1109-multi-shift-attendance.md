# Release Note — Multi-Shift Attendance & GPS Check-in
**Date:** 2026-05-17  
**Branch:** main  
**Type:** Major Feature Release

---

## Summary

Bản release này triển khai hệ thống chấm công đa ca (multi-shift), GPS check-in/out, phân ca theo tháng, và các tính năng báo cáo chuyên sâu. Đây là bản release lớn nhất kể từ khi khởi tạo dự án.

---

## ⚠️ Breaking Changes / DB Migration Required

| Item | Chi tiết |
|------|---------|
| **DB migration** | `20260512000000_multi_shift_attendance` — **BẮT BUỘC** chạy trước khi deploy |
| **Unique constraint thay đổi** | `attendance(employee_id, date)` → `attendance(employee_id, date, shift_id)` |
| **New tables** | `employee_shift_schedule`, `employee_day_off` |

### Migration Steps
```bash
# 1. Backup DB trước
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 2. Chạy migration
cd backend && npx prisma migrate deploy

# 3. Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM attendance WHERE shift_id IS NULL;"
# Kết quả phải = 0
```

---

## New Features

### 1. Multi-Shift Attendance (Backend)
- Nhân viên có thể check-in/out nhiều ca trong cùng một ngày
- Mỗi session = 1 row `attendance(employee_id, date, shift_id)`
- **ShiftResolverService**: tự động xác định ca dựa theo thời gian check-in
- `attendance-checkin.service.ts`: tách riêng logic check-in/out khỏi `attendance.service.ts`
- `attendance-query.service.ts`: queries tập trung, tránh duplicate
- `attendance-export.service.ts` + sub-services: export Excel (summary, grid, detail)
- Helpers: `shift-resolver`, `session-hours` tính toán giờ làm việc/OT/late

### 2. GPS Check-in (Frontend + Backend)
- `haversine.ts`: tính khoảng cách GPS (metres) giữa nhân viên và văn phòng
- `gps-check-in-panel.tsx`: UI check-in bằng GPS với validation radius
- `https-warning-banner.tsx`: cảnh báo khi truy cập qua HTTP (GPS không khả dụng)
- `location-reason-box.tsx`: nhập lý do khi check-in ngoài phạm vi

### 3. Shift Assignment & Schedule Modules (Backend)
- **`shift-assignment` module**: CRUD phân ca theo tháng cho nhân viên
  - Unique: 1 ca/nhân viên/tháng
  - DTO: tạo, cập nhật, bulk assign
- **`shift-schedule` module**: lịch ca theo ngày (nhân viên ca xoay)
  - Model: `EmployeeShiftSchedule(employeeId, shiftId, date)`
  - Unique: 1 ca/nhân viên/ngày

### 4. Employee Day-Off Management
- Model mới: `EmployeeDayOff` — lưu OFF/AL/SL/H theo ngày
- Tách biệt khỏi `LeaveRequest` — phục vụ báo cáo chấm công grid

### 5. Shift Assignment Page (Frontend)
- Trang `/shift-assignments` — quản lý phân ca nhân viên
- `frontend/src/app/shift-assignments/`: page + components
- Services: `shift-assignment.service.ts`, `shift-schedule.service.ts`

### 6. Attendance Page Refactor (Frontend)
Major refactor `frontend/src/app/attendance/page.tsx` (~1300 lines → component-based):

| Component | Mô tả |
|-----------|--------|
| `today-sessions-list.tsx` | Danh sách ca hôm nay |
| `session-card.tsx` | Card 1 session (check-in/out time, duration) |
| `unclosed-session-warning-banner.tsx` | Cảnh báo ca chưa check-out |
| `daily-summary-card.tsx` | Tổng kết ngày (tổng giờ, OT, trạng thái) |
| `attendance-history-table.tsx` | Lịch sử chấm công |
| `my-attendance-history.tsx` | Lịch sử của nhân viên |
| `checkout-shift-picker-modal.tsx` | Modal chọn ca khi check-out |

Hooks tách ra:
- `use-checkin-checkout.ts`
- `use-today-sessions.ts`
- `use-current-month-shifts.ts`
- `use-unclosed-sessions.ts`

### 7. Admin Attendance Views (Frontend)
| Component | Mô tả |
|-----------|--------|
| `admin-attendance-report.tsx` | Report tổng hợp admin |
| `admin-attendance-grid-view.tsx` | Grid view theo ngày × nhân viên |
| `admin-attendance-cc-grid-view.tsx` | Grid view compact (CC mode) |
| `admin-attendance-cc-grid-cells.tsx` | Cell components cho CC grid |
| `admin-attendance-detail-view.tsx` | Chi tiết từng session |
| `admin-attendance-kpi-strip.tsx` | KPI strip (tổng giờ, OT, vắng...) |

### 8. Attendance Correction Request System (đã committed)
- Nhân viên gửi yêu cầu chỉnh sửa chấm công
- Admin/HR review và approve/reject
- Components: `correction-request-form-modal.tsx`, `correction-admin-panel.tsx`, `correction-review-modal.tsx`, `corrected-badge.tsx`
- Backend: `AttendanceCorrectionRequest` model, `is_corrected` column trên `Attendance`

### 9. Reports Enhancement
- `/reports/attendance` — cập nhật với filter ca làm việc
- `/reports/attendance-fixed` — báo cáo ca cố định
- `/reports/attendance-shift` — báo cáo ca xoay
- `reports/page.tsx` — cập nhật navigation

### 10. PWA Improvements (đã committed)
- PWA icons cho Safari installation
- Service Worker cập nhật (`public/sw.js`)
- `ServiceWorkerRegistration.tsx` cải thiện

---

## Modified Files

### Backend
| File | Thay đổi |
|------|---------|
| `prisma/schema.prisma` | Thêm `EmployeeShiftSchedule`, `EmployeeDayOff`; cập nhật relations |
| `src/app.module.ts` | Đăng ký `ShiftAssignmentModule`, `ShiftScheduleModule` |
| `src/attendance/attendance.module.ts` | Refactor — thêm sub-services |
| `src/attendance/attendance.service.ts` | Slim down — delegate sang sub-services |
| `src/attendance/attendance.controller.ts` | Cập nhật endpoints |
| `src/attendance/attendance-processor.service.ts` | Cập nhật multi-shift logic |
| `src/attendance/dto/check-in.dto.ts` | Thêm GPS fields |
| `src/attendance/dto/check-out.dto.ts` | Thêm shift picker fields |
| `src/attendance/dto/report-attendance.dto.ts` | Cập nhật report filters |
| `src/employee/employee.service.ts` | Thêm shift assignment relations |
| `src/leave/leave-approval.service.ts` | Cập nhật notification logic |

### Frontend
| File | Thay đổi |
|------|---------|
| `src/app/attendance/page.tsx` | Refactor toàn bộ — dùng components |
| `src/app/reports/attendance/page.tsx` | Cập nhật với shift filters |
| `src/app/reports/page.tsx` | Thêm link đến báo cáo mới |
| `src/app/dashboard/page.tsx` | Minor update |
| `src/components/layout/Sidebar.tsx` | Thêm Shift Assignments menu item |
| `src/services/attendance.service.ts` | Thêm multi-shift API calls |
| `src/types/index.ts` | Thêm ~113 lines types mới |
| `src/locales/en.json`, `vi.json` | Thêm i18n keys mới |
| `public/sw.js` | Cập nhật service worker |
| `next.config.ts` | Minor cleanup |

---

## New Files

### Backend (untracked — cần commit)
```
backend/src/attendance/attendance-checkin.service.ts
backend/src/attendance/attendance-query.service.ts
backend/src/attendance/attendance-export.service.ts
backend/src/attendance/attendance-export-detail.service.ts
backend/src/attendance/attendance-export-grid.service.ts
backend/src/attendance/attendance-export-summary.service.ts
backend/src/attendance/dto/attendance-controller-inline.dto.ts
backend/src/attendance/dto/daily-summary.dto.ts
backend/src/attendance/helpers/          (shift-resolver, session-hours, ...)
backend/src/shift-assignment/            (module, service, controller, dto)
backend/src/shift-schedule/             (module, service, controller, dto)
backend/prisma/migrations/20260512000000_multi_shift_attendance/
```

### Frontend (untracked — cần commit)
```
frontend/src/app/attendance/components/ (14 components mới)
frontend/src/app/attendance/hooks/      (4 hooks)
frontend/src/app/shift-assignments/     (page + components)
frontend/src/app/reports/attendance-fixed/
frontend/src/app/reports/attendance-shift/
frontend/src/services/shift-assignment.service.ts
frontend/src/services/shift-schedule.service.ts
frontend/src/utils/haversine.ts
frontend/public/favicon.ico
```

---

## Deploy Checklist

- [ ] Backup PostgreSQL database
- [ ] Run `npx prisma migrate deploy` trên server
- [ ] Verify không có `shift_id IS NULL` trong attendance
- [ ] Deploy backend (restart PM2)
- [ ] Deploy frontend (rebuild Next.js)
- [ ] Test GPS check-in trên HTTPS
- [ ] Test multi-shift: check-in 2 ca trong ngày
- [ ] Test correction request flow
- [ ] Test export Excel reports
- [ ] Test shift assignment admin page

---

## Files NOT to commit
- `backend/create-day-off-table.js` — script tạm, không cần
- `backend/setup-day-off-db.sh` — script tạm, không cần
- `hr_db.dump` — database dump, tuyệt đối không commit
- `html/` — thư mục tạm
- `repomix-output.xml` — output tạm
- `frontend/.claude/launch.json` — IDE config cục bộ
- `plans/reports/` — internal reports

---

## Unresolved Questions

1. `backend/create-day-off-table.js` và `setup-day-off-db.sh` có cần xóa không, hay giữ lại để onboarding?
2. GPS radius validation — hiện tại đang hardcode hay đọc từ `OfficeLocation.radius`?
3. `attendance-shift` report page có sẵn sàng production chưa hay vẫn đang WIP?
4. `frontend/.claude/launch.json` — nên thêm vào `.gitignore`?
