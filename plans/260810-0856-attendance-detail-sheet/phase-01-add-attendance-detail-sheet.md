# Phase 01 — Sheet "Chi tiết chấm công" (FIXED export)

## Context Links
- Overview: [plan.md](plan.md)
- Sửa: `backend/src/attendance/attendance-export-combined.service.ts` (assembly line 338–352)
- Khuôn mẫu: `backend/src/attendance/attendance-export-late-early-sheet.ts`
- Bộ cột tham chiếu: `frontend/src/app/attendance/components/admin-attendance-detail-export.ts:215-288`
  (+ helper `statusWithLeave:54`, `buildNote:23`, `correctionLabel:41`, `officeBadge:48`)
- Data source: `AttendanceQueryService.getReport` (`attendance-query.service.ts:371`, include tại 436–441)

## Overview
- Priority: P2 | Status: pending | Effort: ~3h
- Thêm sheet #4 vào workbook FIXED: chi tiết chấm công theo ngày cho TẤT CẢ nhân viên.

## Key Insights
1. `records` trả từ `getReport` là full model `Attendance` + `shift` + `corrections[0]{status,reason,reviewNote}`
   + `leaveRequest{type,isHalfDay}` + `employee{code,fullName,department,position,office}`.
   → Đủ dựng mọi cột, **không cần query thêm**.
2. Field note có sẵn trên record: `checkinNote`, `checkoutNote`, `locationNote`, `lateReason`,
   `earlyReason` (schema.prisma:345-351). `lateReason/earlyReason` ≠ `locationNote` — không gộp nhầm.
3. `calcLateEarlyMinutes` đã tồn tại (late-early-sheet.ts:20) — **export lại và dùng chung**, không copy.
4. Sheet `Đi trễ về sớm` đã thiết lập convention "cột NV + group header row" → tái dùng y hệt,
   đọc giả (HR) đã quen layout này.
5. FIXED mode: 1 ngày thường 1 record; multi-session vẫn có thể có (grid dùng `sessionsCount`).
   → 1 dòng / 1 record là đúng ngữ nghĩa "chi tiết".
6. Ngày nghỉ phép có thể **không có** attendance row (đã có tiền lệ overlay leave ở SHIFT grid,
   combined.service:246-261) → cần overlay leave tương tự để không mất dòng "Nghỉ phép".
7. Yêu cầu hiện HẾT working day (kể cả vắng mặt hoàn toàn) → cần danh sách working days trong kỳ
   (loại trừ ngày nghỉ tuần theo `shift`/lịch làm việc — tái dùng logic tính working-day đã có ở
   `addGridSheet`/summary thay vì viết lại) để overlay dòng "Không chấm công" khi thiếu cả record
   lẫn leave.
8. Branch: employee `select` tại combined.service:123-127 cần thêm `branch:{select:{id,name}}`
   (theo Branch model schema.prisma:10-23) để lấy tên chi nhánh.

## Requirements
Functional:
- Sheet tên chính xác `Chi tiết chấm công`, đặt sau `Đi trễ về sớm`.
- Cột: `Mã NV | Họ tên | Chi nhánh | Phòng ban | Ngày | Thứ | Ca | Trạng thái | Vào | Ra | Tổng giờ | Trễ (phút) | Sớm (phút) | Ghi chú | Yêu cầu` (15 cột — thêm Chi nhánh).
- Sắp xếp: phòng ban → mã NV → ngày (khớp thứ tự `employees` ở combined.service:141-144).
- Group header row mỗi khi đổi nhân viên: `MÃ — Tên · Chi nhánh · Phòng ban`.
- Chỉ build khi `workingMode === 'FIXED'`.
- Hiện HẾT ngày làm việc trong kỳ, kể cả vắng mặt hoàn toàn (không record, không phép) → dòng `Trạng thái = 'Không chấm công'`, Vào/Ra/Tổng giờ rỗng.
- Cột `Ca` giữ nguyên (có thể trống ở dòng vắng mặt / nghỉ phép).
- Rỗng → dòng italic "Không có dữ liệu chấm công trong khoảng thời gian này."

Non-functional:
- Không query DB mới; không đổi API contract; giữ file mới < 200 dòng.

## Architecture
Data flow:
```
exportCombined
  ├─ records (getReport)  ─┐
  ├─ leaveReqs            ─┼→ buildAttendanceDetailSheet(wb, records, leaveReqs, start, end)
  └─ employees (thứ tự)   ─┘        │
                                     ├─ map record → DetailRow (status/note/request strings)
                                     ├─ overlay leave days thiếu record → DetailRow(status='Nghỉ phép')
                                     ├─ sort dept→code→date
                                     └─ render: title + header + group rows + data rows
```
Composition chuỗi (port từ frontend helper):
- **Trạng thái** = `[nhãn cơ bản] | (Loại phép · Cả/Nửa ngày)? | Đi muộn? | Về sớm? | Đã điều chỉnh? | Vào: Trong/Ngoài VP? | Ra: Trong/Ngoài VP?`
  - nhãn cơ bản: `isOnLeave`→`Nghỉ phép`; không checkin→`Không chấm công`; `forgotCheckout`/thiếu checkout→`Thiếu giờ ra`; late>0→`Đi muộn`; early>0→`Về sớm`; còn lại→`Đủ công`.
  - loại phép map: annual/sick/compensatory/unpaid/special → Phép năm/Phép ốm/Phép bù/Không lương/Phép ĐB.
  - GPS badge chỉ khi `checkinLat != null` / `checkoutLat != null` (khớp gating tại combined.service:331-336).
- **Ghi chú** = join ` | ` của `Vào: {checkinNote}`, `Ra: {checkoutNote}`, `Địa điểm: {locationNote}`,
  `Lý do trễ: {lateReason}`, `Lý do sớm: {earlyReason}`, `Lý do ĐC: {corrections[0].reason}`,
  `Ghi chú duyệt: {corrections[0].reviewNote}`.
- **Yêu cầu** = `corrections[0].status` → Chờ duyệt / Đã duyệt / Từ chối / ''.

Style: dùng `BORDER`, `groupFill FFEEF1EE`, `lateFill FFFBE9E4`, `earlyFill FFE6EEF6`, font size 9 —
đồng bộ late-early sheet.

## Related Code Files
Create:
- `backend/src/attendance/attendance-export-detail-sheet.ts`

Modify:
- `backend/src/attendance/attendance-export-late-early-sheet.ts` — thêm `export` cho `calcLateEarlyMinutes`, `DOW_VI`, `fmtT`.
- `backend/src/attendance/attendance-export-combined.service.ts` — import + gọi sheet mới (chỉ FIXED), ~2 dòng.

Delete: none.

## Implementation Steps
1. Trong `attendance-export-late-early-sheet.ts`: đổi `function calcLateEarlyMinutes`, `const DOW_VI`, `const fmtT` thành `export`. Không đổi logic.
2. Tạo `attendance-export-detail-sheet.ts`:
   1. Import ExcelJS + 3 helper trên.
   2. Định nghĩa `LEAVE_TYPE_LABEL`, `COLS` (14 cột, width theo bảng ở Requirements).
   3. `buildStatus(r)`, `buildNote(r)`, `requestLabel(r)` — 3 hàm thuần, mỗi hàm < 25 dòng.
   4. `toDetailRow(r)` → `{empCode, empName, deptName, date, shiftName, checkin, checkout, hours, late, early, status, note, request}`.
   5. Overlay leave: với mỗi `leaveReq` approved, duyệt ngày trong `[start,end]`, nếu chưa có row `empId_date` → push row nghỉ phép (checkin/checkout rỗng).
   6. Sort `deptName` (localeCompare 'vi') → `empCode` → `date`.
   7. Render: title merge (`CHI TIẾT CHẤM CÔNG`, bold 13), subtitle khoảng ngày (italic xám), header row 3, group header + data rows; tô `lateFill`/`earlyFill` cho ô Trễ/Sớm > 0; `ws.views = [{ state: 'frozen', ySplit: 3 }]`.
   8. Empty state row.
3. Trong `exportCombined`: `if (workingMode === 'FIXED') buildAttendanceDetailSheet(wb, records, leaveReqs, start, end);` ngay sau `buildLateEarlySheet(wb, records);`.
4. `cd backend && npx tsc --noEmit` (hoặc `npm run build`) kiểm tra compile.
5. Chạy export FIXED thật trên 1 tháng, mở file kiểm tra thứ tự sheet + dữ liệu 2-3 nhân viên đối chiếu với báo cáo chi tiết trên web.

## Todo List
- [ ] 1. Export helper từ late-early-sheet.ts
- [ ] 2. Tạo attendance-export-detail-sheet.ts (builders + render)
- [ ] 3. Overlay leave days thiếu attendance row
- [ ] 4. Gọi từ exportCombined (chỉ FIXED)
- [ ] 5. Compile check
- [ ] 6. Verify file Excel thực tế

## Success Criteria
- File export FIXED có đúng 4 sheet, sheet 4 tên `Chi tiết chấm công`.
- Số dòng dữ liệu = số attendance record trong kỳ (+ leave days overlay), không trùng, không thiếu.
- Với 1 nhân viên mẫu, cột Ngày/Vào/Ra/Trễ/Sớm/Trạng thái khớp 100% với export chi tiết từng NV trên web cùng kỳ.
- Export SHIFT vẫn 3 sheet, không đổi.
- `tsc --noEmit` sạch.

## Risk Assessment
| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Lệch số liệu Trễ/Sớm vs web (grace minutes) | Trung bình | Trung bình | Dùng chung `calcLateEarlyMinutes` — cùng công thức raw, không trừ grace (đã ghi rõ trong docblock) |
| File Excel phình (~3300 dòng + group rows) | Cao | Thấp | ExcelJS stream ghi thẳng res; 3–4k dòng là nhỏ. Không cần phân trang |
| Timezone lệch ngày (server UTC+7) | Trung bình | Cao | Dùng `localDateStr`/`new Date(r.date)` y hệt các sheet hiện có |
| Duplicate row khi ngày vừa có record vừa có leave | Trung bình | Trung bình | Overlay chỉ thêm khi key `empId_date` chưa tồn tại |
| Nhân viên nghỉ việc lọt vào sheet | Thấp | Thấp | Lọc theo tập `employees` đã status-filtered (combined.service:132-139) |

## Security Considerations
- Không endpoint mới; kế thừa guard/RBAC của endpoint export hiện tại.
- Không thêm field nhạy cảm (không lương, không toạ độ GPS thô — chỉ nhãn Trong/Ngoài VP + khoảng cách như web đang hiển thị).
- Không log dữ liệu nhân sự ra console.

## Next Steps
- Sau merge: `docs-manager` cập nhật `docs/project-changelog.md`.
- Nếu HR muốn sheet này cho cả SHIFT → mở rộng bằng cách bỏ điều kiện `workingMode === 'FIXED'` + thêm dòng theo từng ca.

## Resolved Decisions (user 2026-08-10)
1. Hiện HẾT — kể cả ngày vắng mặt hoàn toàn → dòng "Không chấm công".
2. Thêm cột Chi nhánh (Branch) — sửa `select` combined.service:123-127.
3. Giữ cột `Ca`.
4. SHIFT giữ nguyên 3 sheet (mặc định, không phản đối).
5. Frontend không đổi (mặc định, không phản đối).
