---
title: "Sheet 'Chi tiết chấm công' cho export Ca cố định"
description: "Thêm sheet thứ 4 (chi tiết chấm công theo ngày, toàn bộ nhân viên) vào file Excel export ca cố định."
status: pending
priority: P2
effort: 3h
branch: main
tags: [attendance, export, excel, backend]
created: 2026-08-10
---

# Plan — Sheet "Chi tiết chấm công" (FIXED export)

## Mục tiêu
Export ca cố định (`attendance-export-combined.service.ts`) hiện có 3 sheet:
`Bảng Chấm Công` → `Báo Cáo Ngày Công` → `Đi trễ về sớm`.
Thêm sheet #4 `Chi tiết chấm công`: mỗi dòng = 1 ngày công của 1 nhân viên,
cột theo bộ cột của báo cáo chi tiết từng nhân viên (Ngày, Thứ, Ca, Trạng thái,
Vào, Ra, Tổng giờ, Trễ, Sớm, Ghi chú, Yêu cầu) + Mã NV / Họ tên / Phòng ban,
nhóm theo nhân viên.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Thêm sheet Chi tiết chấm công](phase-01-add-attendance-detail-sheet.md) | pending | 3h |

## Quyết định kiến trúc (chốt)
- **File mới** `backend/src/attendance/attendance-export-detail-sheet.ts`, export
  `buildAttendanceDetailSheet(wb, records, leaveReqs, start, end)` — theo đúng khuôn mẫu
  `attendance-export-late-early-sheet.ts` (DRY + combined service đã 690 dòng, không phình thêm).
- **Layout**: bảng phẳng có cột `Mã NV / Họ tên / Phòng ban` + **group header row** theo nhân viên
  — copy nguyên convention của sheet `Đi trễ về sớm` (line 132–165), không phát minh kiểu mới.
- **Không query mới**: tái dùng `records` (đã có `shift`, `corrections[0]`, `leaveRequest`,
  `checkinNote/checkoutNote/lateReason/earlyReason/locationNote/isCorrected`) và `leaveReqs`
  đã fetch sẵn trong `exportCombined`.
- **Chỉ FIXED**: gọi sau `buildLateEarlySheet` khi `workingMode === 'FIXED'` (yêu cầu người dùng
  chỉ nói về export Ca cố định; SHIFT giữ nguyên 3 sheet).
- **Trễ/Sớm**: dùng lại `calcLateEarlyMinutes` — export nó từ `attendance-export-late-early-sheet.ts`
  thay vì copy công thức (DRY).

## Dependencies
- Không thay đổi DB, DTO, API contract, frontend. Thuần backend Excel builder.
- Blocker: không.

## Rollback
Xoá 1 dòng gọi trong `exportCombined` + xoá file mới → về nguyên trạng.
