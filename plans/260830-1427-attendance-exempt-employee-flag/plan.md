# Cờ nhân viên ưu tiên (miễn chấm công) + setting loại trừ khỏi báo cáo

## Yêu cầu gốc
Nhân viên có thêm cờ ưu tiên "không phải chấm công". Thêm setting bật/tắt việc
có xuất hiện trong báo cáo hay không. Mặc định setting TẮT = báo cáo tính tất cả
nhân viên; BẬT = loại bỏ nhân viên ưu tiên khỏi báo cáo.

## Thiết kế: 2 lớp hành vi độc lập

**Lớp A — bản thân cờ `attendanceExempt` (luôn áp dụng, không phụ thuộc setting):**
Nhân viên được đánh dấu ưu tiên thì không bị tính "chưa checkin/vắng" ở dashboard
điều hành chấm công (`/dashboard`) và không nhận nhắc nhở checkin qua Telegram.
Họ vẫn có thể tự chấm công bình thường nếu muốn — không có gì chặn.

**Lớp B — setting `report_exclude_attendance_exempt` (SystemConfig key-value,
default `'false'`):** chỉ ảnh hưởng tới các màn/API BÁO CÁO — khi bật, nhân viên
ưu tiên bị loại khỏi kết quả. Khi tắt (mặc định), báo cáo tính tất cả như cũ.

Lý do tách 2 lớp: "không phải chấm công" là đặc tính cố định của nhân viên (luôn
đúng), còn việc báo cáo có liệt kê họ hay không là nhu cầu xem/không xem của HR,
độc lập với việc họ có bị nhắc chấm công hay không.

## Thay đổi Backend

- `backend/prisma/schema.prisma`: `Employee.attendanceExempt Boolean @default(false)`.
  Migration: `20260830000000_add_employee_attendance_exempt` (áp trực tiếp bằng
  `prisma db execute` + `migrate resolve --applied` vì lịch sử migration cũ không
  qua được shadow-DB — theo đúng tiền lệ các migration ALTER COLUMN trước đó).
- `system-config.service.ts`: seed default `report_exclude_attendance_exempt = 'false'`.
- `employee` module: DTO tạo/sửa nhận `attendanceExempt?: boolean`;
  `ListEmployeeDto` nhận `excludeAttendanceExempt?: boolean` (cờ opt-in cho các
  màn báo cáo — khi true, service tự kiểm tra setting rồi mới quyết định lọc).
- `attendance-query.service.ts::getReport` — điểm tập trung duy nhất cho toàn bộ
  dữ liệu bản ghi chấm công dùng trong báo cáo/export (grid, summary, detail,
  combined, on-screen report, và cả trend-chart của dashboard điều hành) — luôn
  tự kiểm tra setting, không cần caller truyền cờ.
- `attendance-export-combined.service.ts` — nguồn `employee.findMany` roster
  riêng (không qua getReport) áp cùng điều kiện.
- `notification.service.ts` (nhắc checkin Telegram) — loại nhân viên ưu tiên
  không điều kiện (Lớp A).

## Thay đổi Frontend

- `types/index.ts`, `employee.service.ts`: thêm field/param `attendanceExempt`,
  `excludeAttendanceExempt`.
- `EditEmployeeModal.tsx`: checkbox "Nhân viên ưu tiên (miễn chấm công)".
- `EmployeeProfile.tsx`, `EmployeeTable.tsx`: badge "Ưu tiên" khi có cờ.
- `settings/page.tsx`: thêm toggle switch `report_exclude_attendance_exempt`
  (theo đúng mẫu toggle `device_check_enabled` có sẵn).
- `attendance-ops-section.tsx` (dashboard điều hành): lọc bỏ nhân viên ưu tiên
  khỏi roster trước khi tính snapshot (Lớp A).
- `admin-attendance-report.tsx`: truyền `excludeAttendanceExempt: true` cho
  fetch roster (Lớp B — theo đúng setting).

## Đã kiểm tra
- Backend `npx tsc --noEmit` — sạch.
- Frontend `npx tsc --noEmit` — sạch.
- Migration áp thành công lên DB dev (`hr_dev`), Prisma Client generate lại OK.
- Backend khởi động lại sạch, không lỗi wiring module (SystemConfigModule được
  import vào `employee.module.ts` và `attendance.module.ts`).

## Chưa kiểm tra được
- Không có sẵn tài khoản đăng nhập hợp lệ trong phiên làm việc này (seed mặc định
  `admin@company.com` trả 401 trên DB dev thật) nên chưa thao tác UI trực tiếp
  trên trình duyệt để xác nhận trực quan (toggle Settings, checkbox Edit
  Employee, badge danh sách, dashboard điều hành loại đúng nhân viên ưu tiên).
  Cần user đăng nhập kiểm tra lại.

## Phạm vi cố ý bỏ qua (YAGNI)
- Báo cáo nghỉ phép (leave report) — yêu cầu chỉ nói "chấm công", không đụng tới.
- `getDailySummary` (`/attendance/daily-summary`) — dùng cho card cá nhân, không
  phải báo cáo nhiều nhân viên.
