# Release Note — Attendance & Device Validation
**Ngày tạo:** 2026-05-23  
**Branch:** main  
**Người tạo:** d.nghiald

---

## Tóm tắt thay đổi

Bản release này bao gồm **2 nhóm thay đổi chính**:
1. Tính năng **Device Validation** cho check-in chấm công
2. Các **bugfix** cho module Attendance (timezone, UI, hiển thị ngày)

---

## ⚠️ Checklist trước khi deploy lên Production

### 1. Database Migration (BẮT BUỘC)

Chạy 2 migration mới theo thứ tự:

```bash
cd backend
npx prisma migrate deploy
```

| Migration | Mô tả |
|-----------|-------|
| `20260518000000_add_google_id_to_employee` | Thêm cột `google_id` vào bảng `Employee` |
| `20260519000000_add_registered_device` | Tạo bảng mới `RegisteredDevice` + cột `device_validation_mode` trên `Employee` |

> **Lưu ý:** `device_validation_mode` mặc định là `DISABLED` — không ảnh hưởng đến nhân viên hiện tại cho đến khi admin bật lên.

---

### 2. Build & Deploy Backend

```bash
cd backend
yarn install          # yarn.lock đã được cập nhật
yarn build
npx prisma generate
```

**Thay đổi code backend:**
- `session-hours.ts`: `computeSessionDate()` dùng UTC+7 thay vì UTC — sửa lỗi check-in buổi sáng sớm bị ghi sai ngày
- `attendance.service.ts`: Dùng `computeSessionDate()` cho `checkInOut()`
- `attendance-query.service.ts`: `findTodaySessions()` cũng dùng UTC+7
- `device-validation.service.ts`: Fallback mặc định đổi từ `STRICT` → `DISABLED`
- **Module mới**: `DeviceModule` — controller, service, DTOs cho quản lý thiết bị

---

### 3. Build & Deploy Frontend

```bash
cd frontend
npm install
npm run build
```

**Thay đổi code frontend:**
- `admin-attendance-cc-grid-cells.tsx`: Sửa màu/icon cell khi có `lateMinutes > 0`, bỏ OT dot
- `admin-attendance-detail-view.tsx`: Hiển thị `checkinTime` thay vì `date` cho ngày; bỏ cột OT, thêm cột "Tổng giờ"
- `admin-attendance-report.tsx`: Fix "Số ca đã phân" = 0 với role employee (dùng `/me` endpoint)
- `attendance-history-table.tsx`: Hiển thị `checkinTime ?? date` cho cột Ngày
- `my-attendance-history.tsx`: Tương tự, hiển thị `checkinTime ?? date`
- `unclosed-session-warning-banner.tsx`: Hiển thị đúng ngày theo `checkinTime`
- **Trang mới**: `/devices` (employee tự quản lý thiết bị), `/admin/devices` (admin quản lý)

---

### 4. Kiểm tra sau khi deploy

| Hạng mục | Cách kiểm tra |
|----------|---------------|
| Migration thành công | `npx prisma migrate status` → tất cả `Applied` |
| Check-in buổi sáng sớm | Check-in lúc 6:xx VN → ghi đúng ngày hôm đó (không bị lùi 1 ngày) |
| "Số ca đã phân" — employee | Đăng nhập role employee → Báo cáo Command Center → KPI đúng số |
| Device validation | Vào `/devices` → đăng ký thiết bị → kiểm tra hiển thị |
| Google OAuth | Đăng nhập bằng Google với email @dcorp.com.vn |

---

## Chi tiết tính năng mới

### Device Registration Validation
- Nhân viên có thể đăng ký thiết bị tại `/devices`
- Admin quản lý tất cả thiết bị tại `/admin/devices`
- Mỗi nhân viên có 3 chế độ: `DISABLED` (mặc định) / `WARNING` / `STRICT`
- Fingerprint thiết bị dùng SHA-256 từ browser
- Ghi lại `unknownDevice = true` trên bản ghi attendance nếu thiết bị lạ

### Bugfix Timezone UTC+7
- Trước: check-in lúc 06:30 VN (= 23:30 UTC ngày hôm trước) → ghi nhầm ngày hôm trước
- Sau: dùng giờ VN (UTC+7) để xác định ngày → ghi đúng ngày hôm đó

---

## Files chưa commit (cần commit trước khi deploy)

```
M  backend/prisma/schema.prisma
M  backend/src/attendance/attendance-query.service.ts
M  backend/src/attendance/attendance.service.ts
M  backend/src/attendance/helpers/session-hours.ts
M  backend/src/device/device-validation.service.ts
M  backend/yarn.lock
M  frontend/src/app/attendance/components/ (6 files)
```

> **Chưa push:** 1 commit (`3e569da`) + toàn bộ working changes trên cần được commit và push trước khi deploy.

---

## Câu hỏi còn mở

1. `hr_db.dump` trong root — có cần backup prod DB trước khi migrate không?
2. Các script `fix-attendance-dates.js`, `create-day-off-table.js` trong `backend/` — có cần chạy thủ công trên prod không?
3. Sau khi deploy, admin có muốn bật `device_validation_mode = STRICT` cho một số nhân viên cụ thể không?
