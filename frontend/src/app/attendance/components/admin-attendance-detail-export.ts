/**
 * Client-side Excel export for the single-employee "Nhật ký chấm công từng ngày" table.
 * Builds the workbook from the same EmployeeRow/DayCell data already rendered on screen,
 * so the exported file always matches exactly what the user sees — no backend round-trip,
 * no duplicated day-building logic.
 */
import { STATUS_META, fmtDistanceKm, type EmployeeRow, type DayCell, type ShiftEntry, type CellStatus } from './admin-attendance-report-types';

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: 'Phép năm',
  sick: 'Phép ốm',
  compensatory: 'Phép bù',
  unpaid: 'Không lương',
  special: 'Phép ĐB',
};

function statusLabel(status: CellStatus): string {
  return STATUS_META[status]?.label ?? status;
}

function buildNote(cell: DayCell): string {
  const parts: string[] = [];
  if (cell.note) parts.push(cell.note);
  if (cell.checkinNote) parts.push(`Vào: ${cell.checkinNote}`);
  if (cell.checkoutNote) parts.push(`Ra: ${cell.checkoutNote}`);
  if (cell.locationNote) parts.push(`Địa điểm: ${cell.locationNote}`);
  if (cell.correctionReason) parts.push(`Lý do ĐC: ${cell.correctionReason}`);
  if (cell.correctionReviewNote) parts.push(`Ghi chú duyệt: ${cell.correctionReviewNote}`);
  return parts.join(' | ');
}

function buildShiftNote(shift: ShiftEntry): string {
  const parts: string[] = [];
  if (shift.checkinNote) parts.push(`Vào: ${shift.checkinNote}`);
  if (shift.checkoutNote) parts.push(`Ra: ${shift.checkoutNote}`);
  return parts.join(' | ');
}

function correctionLabel(status?: string): string {
  if (status === 'pending') return 'Chờ duyệt';
  if (status === 'approved') return 'Đã duyệt';
  if (status === 'rejected') return 'Từ chối';
  return '';
}

function officeBadge(label: 'Vào' | 'Ra', isInOffice?: boolean, distanceM?: number): string {
  const dist = distanceM != null ? ` (${fmtDistanceKm(distanceM)})` : '';
  return `${label}: ${isInOffice ? 'Trong VP' : 'Ngoài VP'}${dist}`;
}

/** Mirrors the FIXED-mode status cell: primary badge + leave suffix + SecondaryBadges pills, stacked as one string. */
function statusWithLeave(cell: DayCell): string {
  const parts: string[] = [statusLabel(cell.status === 'ot' ? 'ok' : cell.status)];

  if (cell.leaveType) {
    parts.push(`(${LEAVE_TYPE_LABEL[cell.leaveType] ?? cell.leaveType} · ${cell.isHalfDay ? 'Nửa ngày' : 'Cả ngày'})`);
  }
  if ((cell.lateMinutes ?? 0) > 0 && cell.status !== 'ok' && cell.status !== 'ot') parts.push('Đi muộn');
  if ((cell.earlyMinutes ?? 0) > 0 && cell.status !== 'ok' && cell.status !== 'ot') parts.push('Về sớm');
  if (cell.isCorrected || cell.correctionStatus === 'approved') parts.push('Đã điều chỉnh');
  if (cell.hasCheckinGps) parts.push(officeBadge('Vào', cell.isInOffice, cell.officeDistanceM));
  if (cell.checkoutTime && cell.hasCheckoutGps) parts.push(officeBadge('Ra', cell.checkoutIsInOffice, cell.checkoutOfficeDistanceM));

  return parts.join(' | ');
}

/** Mirrors the SHIFT-mode per-shift status cell. ShiftEntry has no separate leaveType field —
 * annual/unpaid/special status IS the leave type. */
function shiftStatusLabel(shift: ShiftEntry): string {
  const parts: string[] = [statusLabel(shift.status === 'ot' ? 'ok' : shift.status)];

  if (shift.status === 'annual' || shift.status === 'unpaid' || shift.status === 'special') {
    parts.push(`(${LEAVE_TYPE_LABEL[shift.status]} · ${shift.isHalfDay ? 'Nửa ca' : 'Cả ngày'})`);
  }
  if ((shift.lateMinutes ?? 0) > 0 && shift.status !== 'late' && shift.status !== 'ok' && shift.status !== 'ot') parts.push('Đi trễ');
  if ((shift.earlyMinutes ?? 0) > 0 && shift.status !== 'early' && shift.status !== 'ok' && shift.status !== 'ot') parts.push('Về sớm');
  if (shift.hasCheckinGps) parts.push(officeBadge('Vào', shift.isInOffice, shift.officeDistanceM));
  if (shift.checkoutTime && shift.hasCheckoutGps) parts.push(officeBadge('Ra', shift.checkoutIsInOffice, shift.checkoutOfficeDistanceM));

  return parts.join(' | ');
}

/** A day/shift counts as a late-or-early incident by raw checkin/checkout clock time vs
 * shift start/end — no grace subtracted — matching the Trễ/Sớm columns on the main sheet. */
function isLateOrEarlyIncident(lateMinutes?: number, earlyMinutes?: number): boolean {
  return (lateMinutes ?? 0) > 0 || (earlyMinutes ?? 0) > 0;
}

interface LateEarlyRow {
  dateStr: string;
  dow: string;
  shiftName: string;
  checkin: string;
  checkout: string;
  late: number;
  early: number;
  note: string;
}

function buildLateEarlyRows(row: EmployeeRow, year: number, month: number): LateEarlyRow[] {
  const out: LateEarlyRow[] = [];

  for (const cell of row.cells) {
    const dateStr = `${String(cell.day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    const dowStr = DOW_VI[cell.dow];

    if (cell.shifts && cell.shifts.length > 0) {
      for (const shift of cell.shifts) {
        if (!isLateOrEarlyIncident(shift.lateMinutes, shift.earlyMinutes)) continue;
        out.push({
          dateStr, dow: dowStr,
          shiftName: shift.shiftName ?? shift.shiftCode,
          checkin: shift.checkinTime ?? '',
          checkout: shift.checkoutTime ?? '',
          late: shift.lateMinutes ?? 0,
          early: shift.earlyMinutes ?? 0,
          note: buildShiftNote(shift),
        });
      }
      continue;
    }

    if (!isLateOrEarlyIncident(cell.lateMinutes, cell.earlyMinutes)) continue;
    out.push({
      dateStr, dow: dowStr,
      shiftName: '',
      checkin: cell.checkinTime ?? '',
      checkout: cell.checkoutTime ?? '',
      late: cell.lateMinutes ?? 0,
      early: cell.earlyMinutes ?? 0,
      note: buildNote(cell),
    });
  }

  return out;
}

function addLateEarlySheet(workbook: import('exceljs').Workbook, row: EmployeeRow, year: number, month: number) {
  const rows = buildLateEarlyRows(row, year, month);
  const totalLateCount = rows.filter((r) => r.late > 0).length;
  const totalEarlyCount = rows.filter((r) => r.early > 0).length;
  const totalLateMin = rows.reduce((s, r) => s + r.late, 0);
  const totalEarlyMin = rows.reduce((s, r) => s + r.early, 0);

  const isShiftMode = row.cells.some((c) => c.shifts && c.shifts.length > 0);
  const ws = workbook.addWorksheet('Đi trễ về sớm');

  const columns = [
    { header: 'Ngày', key: 'date', width: 12 },
    { header: 'Thứ', key: 'dow', width: 8 },
    ...(isShiftMode ? [{ header: 'Ca', key: 'shift', width: 20 }] : []),
    { header: 'Giờ vào', key: 'checkin', width: 10 },
    { header: 'Giờ ra', key: 'checkout', width: 10 },
    { header: 'Trễ (phút)', key: 'late', width: 12 },
    { header: 'Sớm (phút)', key: 'early', width: 12 },
    { header: 'Ghi chú', key: 'note', width: 35 },
  ];

  ws.mergeCells(1, 1, 1, columns.length);
  const title = ws.getCell(1, 1);
  title.value = `BÁO CÁO ĐI TRỄ / VỀ SỚM — ${row.fullName} (${row.code})`;
  title.font = { bold: true, size: 13 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, columns.length);
  const kpi = ws.getCell(2, 1);
  kpi.value = `Lượt đi trễ: ${totalLateCount}  |  Tổng phút trễ: ${totalLateMin}  |  Lượt về sớm: ${totalEarlyCount}  |  Tổng phút sớm: ${totalEarlyMin}`;
  kpi.font = { size: 10, italic: true, color: { argb: 'FF666666' } };
  kpi.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  const headerRowIdx = 3;
  columns.forEach((c, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1EE' } };
    ws.getColumn(i + 1).width = c.width;
  });

  if (rows.length === 0) {
    ws.mergeCells(headerRowIdx + 1, 1, headerRowIdx + 1, columns.length);
    const empty = ws.getCell(headerRowIdx + 1, 1);
    empty.value = 'Không có ngày đi trễ hoặc về sớm trong tháng này.';
    empty.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    return;
  }

  rows.forEach((r, i) => {
    const dataRow = ws.getRow(headerRowIdx + 1 + i);
    const vals = [
      r.dateStr, r.dow,
      ...(isShiftMode ? [r.shiftName] : []),
      r.checkin, r.checkout,
      r.late || '', r.early || '', r.note,
    ];
    vals.forEach((v, ci) => {
      const cell = dataRow.getCell(ci + 1);
      cell.value = v;
      cell.font = { size: 9 };
      cell.alignment = { horizontal: ci < vals.length - 1 ? 'center' : 'left', vertical: 'middle' };
      const lateColIdx = isShiftMode ? 6 : 5;
      const earlyColIdx = lateColIdx + 1;
      if (ci === lateColIdx - 1 && r.late > 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE9E4' } };
      if (ci === earlyColIdx - 1 && r.early > 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EEF6' } };
    });
  });
}

export async function exportEmployeeDailyLogExcel(row: EmployeeRow, year: number, month: number) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Nhật ký chấm công');

  const isShiftMode = row.cells.some((c) => c.shifts && c.shifts.length > 0);

  const columns = [
    { header: 'Ngày', key: 'date', width: 12 },
    { header: 'Thứ', key: 'dow', width: 8 },
    ...(isShiftMode ? [{ header: 'Ca', key: 'shift', width: 18 }] : []),
    { header: 'Trạng thái', key: 'status', width: 30 },
    { header: 'Vào', key: 'checkin', width: 10 },
    { header: 'Ra', key: 'checkout', width: 10 },
    { header: 'Tổng giờ', key: 'hours', width: 10 },
    { header: 'Trễ (phút)', key: 'late', width: 12 },
    { header: 'Sớm (phút)', key: 'early', width: 12 },
    { header: 'Ghi chú', key: 'note', width: 35 },
    { header: 'Yêu cầu', key: 'correction', width: 14 },
  ];
  worksheet.columns = columns;

  for (const cell of row.cells) {
    const dateStr = `${String(cell.day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    const dowStr = DOW_VI[cell.dow];

    if (isShiftMode && cell.shifts && cell.shifts.length > 0) {
      for (const shift of cell.shifts) {
        worksheet.addRow({
          date: dateStr,
          dow: dowStr,
          shift: shift.shiftName ?? shift.shiftCode,
          status: shiftStatusLabel(shift),
          checkin: shift.checkinTime ?? '',
          checkout: shift.checkoutTime ?? '',
          hours: shift.workingHours ? shift.workingHours.toFixed(2) : '',
          late: shift.lateMinutes || '',
          early: shift.earlyMinutes || '',
          note: buildShiftNote(shift),
          correction: correctionLabel(shift.correctionStatus),
        });
      }
      continue;
    }

    worksheet.addRow({
      date: dateStr,
      dow: dowStr,
      ...(isShiftMode ? { shift: '—' } : {}),
      status: statusWithLeave(cell),
      checkin: cell.checkinTime ?? '',
      checkout: cell.checkoutTime ?? '',
      hours: cell.workingHours ? cell.workingHours.toFixed(2) : '',
      late: cell.lateMinutes || '',
      early: cell.earlyMinutes || '',
      note: buildNote(cell),
      correction: correctionLabel(cell.correctionStatus),
    });
  }

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  addLateEarlySheet(workbook, row, year, month);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nhat-ky-cham-cong-${slugifyName(row.fullName)}-${month}-${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Strip Vietnamese diacritics and spaces so the filename is safe across OSes. */
function slugifyName(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .trim().replace(/\s+/g, '-')
    .toLowerCase();
}
