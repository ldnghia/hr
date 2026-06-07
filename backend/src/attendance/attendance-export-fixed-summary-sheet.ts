/**
 * buildFixedSummarySheet — Adds "Báo Cáo Ngày Công" worksheet to an ExcelJS workbook.
 *
 * Designed for FIXED-mode employees (ca cố định):
 *  - Shows: Ngày công, Đi trễ, Về sớm
 *  - Omits: Giờ công, Ca làm (irrelevant for fixed schedule)
 */
import * as ExcelJS from 'exceljs';
import { formatDate } from '../common/utils/format';

/** Format YYYY-MM-DD from local calendar date */
const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttendanceRecord = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeaveRequest = any;

const COLS = [
  { h: 'STT',              w: 5  },
  { h: 'Họ và tên',        w: 22 },
  { h: 'Chức vụ',          w: 14 },
  { h: 'Ngày\ncông',       w: 8  },
  { h: 'Đi\ntrễ',         w: 7  },
  { h: 'Về\nsớm',         w: 7  },
  { h: 'Nghỉ phép\nnăm',  w: 10 },
  { h: 'Nghỉ\nốm',        w: 8  },
  { h: 'Nghỉ\nbù',        w: 8  },
  { h: 'Nghỉ không\nlương', w: 11 },
  { h: 'Nghỉ\nlễ, Tết',   w: 9  },
  { h: 'Nghỉ không\nlý do', w: 11 },
  { h: 'Cộng ngày\ncông hưởng', w: 12 },
];

const thin = { style: 'thin' as const };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function applyCell(cell: ExcelJS.Cell, val: any, opts: Partial<ExcelJS.Style> = {}) {
  cell.value = val;
  cell.border = border;
  cell.alignment = opts.alignment ?? { horizontal: 'center', vertical: 'middle', wrapText: true };
  if (opts.font) cell.font = opts.font;
  if (opts.fill) cell.fill = opts.fill;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildFixedSummarySheet(
  wb: ExcelJS.Workbook,
  records: any[],
  leaveRequests: any[],
  employees: any[],
  start: Date,
  end: Date,
  officialWorkingDays: number,
  officialHolidayDays: number,
  calMap: Map<string, { type: string }>,
) {
  const ws = wb.addWorksheet('Báo Cáo Ngày Công');

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });

  // Title row
  ws.mergeCells(1, 1, 1, COLS.length);
  const tc = ws.getCell(1, 1);
  tc.value = `BÁO CÁO NGÀY CÔNG THÁNG ${start.getMonth() + 1}/${start.getFullYear()}`;
  tc.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  tc.alignment = { horizontal: 'center', vertical: 'middle' };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3949AB' } };
  ws.getRow(1).height = 28;

  // Subtitle row
  ws.mergeCells(2, 1, 2, COLS.length);
  const sc = ws.getCell(2, 1);
  sc.value = `${formatDate(start)} — ${formatDate(end)}  |  Ngày làm việc: ${officialWorkingDays}  |  Ngày lễ: ${officialHolidayDays}`;
  sc.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
  sc.alignment = { horizontal: 'center', vertical: 'middle' };
  sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };
  ws.getRow(2).height = 16;

  // Header row
  ws.getRow(3).height = 36;
  COLS.forEach((c, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = c.h;
    cell.border = border;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBC8F5' } };
  });

  // ── Per-employee aggregation ──────────────────────────────────────────────
  const attDaySet = new Set<string>();          // "empId_date" for ngayCong
  const lateMap   = new Map<number, number>();  // empId → late days count
  const earlyMap  = new Map<number, number>();  // empId → early-out days count

  records.forEach((r) => {
    if (!r.checkinTime || r.isOnLeave) return;
    const ds = localDateStr(new Date(r.date instanceof Date ? r.date : String(r.date)));
    const dayKey = `${r.employeeId}_${ds}`;

    // Count each distinct working day once for ngayCong
    const cal = calMap.get(ds);
    const dow = new Date(ds).getDay();
    const isWorking = cal
      ? cal.type === 'WORKING' || cal.type === 'COMPENSATION'
      : dow !== 0 && dow !== 6;
    if (isWorking) attDaySet.add(dayKey);

    // Count late/early per day (only once per day even with multiple sessions)
    if (r.isLate && !lateMap.has(r.employeeId)) lateMap.set(r.employeeId, 0);
    if (r.isLate) lateMap.set(r.employeeId, (lateMap.get(r.employeeId) ?? 0) + 1);
    if (r.isEarlyOut) earlyMap.set(r.employeeId, (earlyMap.get(r.employeeId) ?? 0) + 1);
  });

  // Data rows
  employees.forEach((emp, idx) => {
    const ngayCong = [...attDaySet].filter(k => k.startsWith(`${emp.id}_`)).length;
    const lateDays  = lateMap.get(emp.id)  ?? 0;
    const earlyDays = earlyMap.get(emp.id) ?? 0;

    const empLeaves = leaveRequests.filter(l => l.employeeId === emp.id);
    const leaveDays = (type: string) =>
      empLeaves.filter(l => l.type === type).reduce((s, l) => s + Number(l.days ?? 0), 0);

    const annual  = leaveDays('annual');
    const sick    = leaveDays('sick');
    const comp    = leaveDays('compensatory');
    const unpaid  = leaveDays('unpaid');
    const accounted = ngayCong + annual + sick + comp + unpaid + officialHolidayDays;
    const unexcused = Math.max(0, officialWorkingDays - accounted);
    const total     = parseFloat((ngayCong + annual + officialHolidayDays + sick + comp).toFixed(1));

    const row = ws.getRow(4 + idx);
    row.height = 16;

    const vals = [idx + 1, emp.fullName ?? '', emp.position?.name ?? '',
      ngayCong, lateDays, earlyDays,
      annual, sick, comp, unpaid, officialHolidayDays, unexcused, total,
    ];

    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = typeof v === 'number' ? (v === 0 ? 0 : parseFloat(Number(v).toFixed(2))) : v;
      cell.border = border;
      cell.font = {
        size: 9,
        // Red bold for unexcused (col 11)
        ...(ci === 11 && (v as number) > 0 ? { bold: true, color: { argb: 'FFCC0000' } } : {}),
        // Orange for late days (col 4)
        ...(ci === 4 && (v as number) > 0 ? { bold: true, color: { argb: 'FFE65100' } } : {}),
        // Blue for early days (col 5)
        ...(ci === 5 && (v as number) > 0 ? { bold: true, color: { argb: 'FF1565C0' } } : {}),
        ...(typeof v === 'number' && v === 0 ? { color: { argb: 'FFAAAAAA' } } : {}),
      };
      cell.alignment = {
        horizontal: ci < 3 ? (ci === 0 ? 'center' : 'left') : 'center',
        vertical: 'middle',
      };
      // Highlight total column (last)
      if (ci === 12) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEFF1' } };
      // Light orange tint for late column
      if (ci === 4 && (v as number) > 0)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
      // Light blue tint for early column
      if (ci === 5 && (v as number) > 0)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    });
  });

  // Totals row
  const totalsRowIdx = 4 + employees.length;
  const tr = ws.getRow(totalsRowIdx);
  tr.height = 18;
  ws.mergeCells(totalsRowIdx, 1, totalsRowIdx, 3);
  const tl = tr.getCell(1);
  tl.value = 'TỔNG CỘNG';
  tl.border = border;
  tl.font = { bold: true, size: 9 };
  tl.alignment = { horizontal: 'center', vertical: 'middle' };
  tl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };

  // Sum columns 4–13 (indices 3–12)
  for (let ci = 3; ci <= 12; ci++) {
    let sum = 0;
    for (let ri = 4; ri < totalsRowIdx; ri++) {
      const v = ws.getRow(ri).getCell(ci + 1).value;
      sum += typeof v === 'number' ? v : 0;
    }
    const cell = tr.getCell(ci + 1);
    cell.value = parseFloat(sum.toFixed(2));
    cell.border = border;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
  }
}
