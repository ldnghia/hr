/**
 * Shared "Đi trễ về sớm" sheet builder — appended to both the grid (FIXED) and
 * summary (SHIFT) Excel exports so admins get one place to review real late/early
 * incidents for the exported date range, without wading through every on-time row.
 *
 * Rows are included by raw checkin/checkout clock time vs shift start/end — no
 * graceLateMinutes/graceEarlyMinutes subtracted — matching the Trễ/Sớm columns on
 * the web report (which also show the unadjusted minute diff).
 */
import * as ExcelJS from 'exceljs';

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * Late/early minutes from raw check-in/check-out clock time vs shift start/end.
 * Anchors the expected start/end to the actual checkin/checkout calendar date
 * (mirrors the frontend's calcLateEarlyMinutes) so cross-day shifts don't produce
 * a bogus number when checkout lands after midnight.
 */
function calcLateEarlyMinutes(
  ci: Date | null,
  co: Date | null,
  shift?: { startTime?: string; endTime?: string; isCrossDay?: boolean } | null,
): { late: number; early: number } {
  let late = 0;
  let early = 0;
  if (!shift?.startTime) return { late, early };

  const [sh, sm] = shift.startTime.split(':').map(Number);
  let expectedStart: Date | null = null;
  if (ci) {
    expectedStart = new Date(ci);
    expectedStart.setHours(sh, sm, 0, 0);
    late = Math.max(0, Math.round((ci.getTime() - expectedStart.getTime()) / 60_000));
  }

  if (co && shift.endTime) {
    const [eh, em] = shift.endTime.split(':').map(Number);
    const expectedEnd = new Date(expectedStart ?? co);
    expectedEnd.setHours(eh, em, 0, 0);
    if (shift.isCrossDay && expectedEnd.getTime() <= (expectedStart ?? expectedEnd).getTime()) {
      expectedEnd.setDate(expectedEnd.getDate() + 1);
    }
    early = Math.max(0, Math.round((expectedEnd.getTime() - co.getTime()) / 60_000));
  }

  return { late, early };
}

const fmtT = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

export function buildLateEarlySheet(wb: ExcelJS.Workbook, records: any[]) {
  const rows = records
    .filter((r) => r.employee)
    .map((r) => {
      const ci = r.checkinTime ? new Date(r.checkinTime) : null;
      const co = r.checkoutTime ? new Date(r.checkoutTime) : null;
      const { late, early } = calcLateEarlyMinutes(ci, co, r.shift);
      const date = new Date(r.date);
      return {
        empCode: r.employee.code ?? '',
        empName: r.employee.fullName ?? '',
        deptName: r.employee.department?.name ?? '',
        date,
        shiftName: r.shift?.name ?? '',
        checkin: fmtT(r.checkinTime),
        checkout: fmtT(r.checkoutTime),
        late,
        early,
        note: [r.checkinNote, r.checkoutNote].filter(Boolean).join(' | '),
        reason: [r.lateReason, r.earlyReason].filter(Boolean).join(' | '),
      };
    })
    .filter((r) => r.late > 0 || r.early > 0)
    .sort((a, b) => a.empCode.localeCompare(b.empCode) || a.date.getTime() - b.date.getTime());

  const totalLateCount = rows.filter((r) => r.late > 0).length;
  const totalEarlyCount = rows.filter((r) => r.early > 0).length;
  const totalLateMin = rows.reduce((s, r) => s + r.late, 0);
  const totalEarlyMin = rows.reduce((s, r) => s + r.early, 0);

  const ws = wb.addWorksheet('Đi trễ về sớm');
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const lateFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFBE9E4' } };
  const earlyFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE6EEF6' } };
  const groupFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEEF1EE' } };

  const COLS = [
    { h: 'Mã NV', w: 12 },
    { h: 'Họ tên', w: 22 },
    { h: 'Phòng ban', w: 18 },
    { h: 'Ngày', w: 10 },
    { h: 'Thứ', w: 6 },
    { h: 'Ca', w: 18 },
    { h: 'Giờ vào', w: 10 },
    { h: 'Giờ ra', w: 10 },
    { h: 'Trễ (phút)', w: 11 },
    { h: 'Sớm (phút)', w: 11 },
    { h: 'Ghi chú', w: 30 },
    { h: 'Lý do trễ/sớm', w: 30 },
  ];
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });

  // KPI summary block (rows 1-2)
  ws.mergeCells(1, 1, 1, COLS.length);
  const title = ws.getCell(1, 1);
  title.value = 'BÁO CÁO ĐI TRỄ / VỀ SỚM';
  title.font = { bold: true, size: 13 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, COLS.length);
  const kpi = ws.getCell(2, 1);
  kpi.value = `Lượt đi trễ: ${totalLateCount}  |  Tổng phút trễ: ${totalLateMin}  |  Lượt về sớm: ${totalEarlyCount}  |  Tổng phút sớm: ${totalEarlyMin}`;
  kpi.font = { size: 10, italic: true, color: { argb: 'FF666666' } };
  kpi.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  // Header row
  const headerRowIdx = 3;
  COLS.forEach((c, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1);
    cell.value = c.h;
    cell.border = border;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = groupFill;
  });

  // Data rows, grouped by employee with a group header row
  let rowIdx = headerRowIdx + 1;
  let lastEmpCode: string | null = null;
  for (const r of rows) {
    if (r.empCode !== lastEmpCode) {
      ws.mergeCells(rowIdx, 1, rowIdx, COLS.length);
      const g = ws.getCell(rowIdx, 1);
      g.value = `${r.empCode} — ${r.empName} · ${r.deptName}`;
      g.font = { bold: true, size: 9.5 };
      g.fill = groupFill;
      g.border = border;
      rowIdx++;
      lastEmpCode = r.empCode;
    }

    const row = ws.getRow(rowIdx);
    const vals = [
      r.empCode, r.empName, r.deptName,
      `${String(r.date.getDate()).padStart(2, '0')}/${String(r.date.getMonth() + 1).padStart(2, '0')}`,
      DOW_VI[r.date.getDay()],
      r.shiftName, r.checkin, r.checkout,
      r.late || '', r.early || '', r.note, r.reason,
    ];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.border = border;
      cell.font = { size: 9 };
      cell.alignment = { horizontal: ci >= 3 && ci <= 9 ? 'center' : 'left', vertical: 'middle' };
      if (ci === 8 && r.late > 0) cell.fill = lateFill;
      if (ci === 9 && r.early > 0) cell.fill = earlyFill;
    });
    rowIdx++;
  }

  if (rows.length === 0) {
    ws.mergeCells(rowIdx, 1, rowIdx, COLS.length);
    const empty = ws.getCell(rowIdx, 1);
    empty.value = 'Không có bản ghi đi trễ hoặc về sớm trong khoảng thời gian này.';
    empty.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
  }
}
