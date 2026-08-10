/**
 * "Chi tiết chấm công" sheet — appended to the combined Excel export (FIXED & SHIFT).
 * One row per attendance record (or per absent/leave working-day with no record),
 * for every employee in the report — the per-employee "Nhật ký chấm công" column
 * set (see admin-attendance-detail-export.ts) expanded to cover the whole roster.
 * "Expected day" differs by mode: FIXED uses the office calendar; SHIFT uses the
 * employee's actual assigned shift schedule (CC can span all 7 days/week).
 */
import * as ExcelJS from 'exceljs';
import { calcLateEarlyMinutes, DOW_VI, fmtT } from './attendance-export-late-early-sheet';

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: 'Phép năm', sick: 'Phép ốm', compensatory: 'Phép bù', unpaid: 'Không lương', special: 'Phép ĐB',
};

const fmtDistanceKm = (m: number) => `${(m / 1000).toFixed(2)}km`;
const officeBadge = (label: 'Vào' | 'Ra', inOffice?: boolean, distM?: number | null) =>
  `${label}: ${inOffice ? 'Trong VP' : 'Ngoài VP'}${distM != null ? ` (${fmtDistanceKm(distM)})` : ''}`;
const requestLabel = (status?: string | null) =>
  status === 'pending' ? 'Chờ duyệt' : status === 'approved' ? 'Đã duyệt' : status === 'rejected' ? 'Từ chối' : '';
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface DetailRow {
  empCode: string; empName: string; branchName: string; deptName: string;
  date: Date; shiftName: string; status: string; checkin: string; checkout: string;
  hours: string; late: number | ''; early: number | ''; note: string; request: string;
}

function buildStatus(r: any): string {
  const parts: string[] = [];
  const hasCheckin = !!r.checkinTime;
  const hasCheckout = !!r.checkoutTime;
  const { late, early } = calcLateEarlyMinutes(
    r.checkinTime ? new Date(r.checkinTime) : null,
    r.checkoutTime ? new Date(r.checkoutTime) : null,
    r.shift,
  );
  let base: string;
  if (r.isOnLeave) base = 'Nghỉ phép';
  else if (!hasCheckin) base = 'Không chấm công';
  else if (r.forgotCheckout || !hasCheckout) base = 'Thiếu giờ ra';
  else if (late > 0) base = 'Đi muộn';
  else if (early > 0) base = 'Về sớm';
  else base = 'Đủ công';
  parts.push(base);

  if (r.isOnLeave && r.leaveRequest?.type) {
    parts.push(`(${LEAVE_TYPE_LABEL[r.leaveRequest.type] ?? r.leaveRequest.type} · ${r.leaveRequest.isHalfDay ? 'Nửa ngày' : 'Cả ngày'})`);
  }
  if (late > 0 && base !== 'Đi muộn') parts.push('Đi muộn');
  if (early > 0 && base !== 'Về sớm') parts.push('Về sớm');
  if (r.isCorrected || r.corrections?.[0]?.status === 'approved') parts.push('Đã điều chỉnh');
  if (r.checkinLat != null) parts.push(officeBadge('Vào', r.isInOffice, r.officeDistanceM));
  if (hasCheckout && r.checkoutLat != null) parts.push(officeBadge('Ra', r.checkoutIsInOffice, r.checkoutOfficeDistanceM));
  return parts.join(' | ');
}

function buildNote(r: any): string {
  const c = r.corrections?.[0];
  return [
    r.checkinNote && `Vào: ${r.checkinNote}`,
    r.checkoutNote && `Ra: ${r.checkoutNote}`,
    r.locationNote && `Địa điểm: ${r.locationNote}`,
    r.lateReason && `Lý do trễ: ${r.lateReason}`,
    r.earlyReason && `Lý do sớm: ${r.earlyReason}`,
    c?.reason && `Lý do ĐC: ${c.reason}`,
    c?.reviewNote && `Ghi chú duyệt: ${c.reviewNote}`,
  ].filter(Boolean).join(' | ');
}

function recordToRow(r: any, emp: any): DetailRow {
  const { late, early } = calcLateEarlyMinutes(
    r.checkinTime ? new Date(r.checkinTime) : null,
    r.checkoutTime ? new Date(r.checkoutTime) : null,
    r.shift,
  );
  return {
    empCode: emp.code ?? '', empName: emp.fullName ?? '',
    branchName: emp.branch?.name ?? '', deptName: emp.department?.name ?? '',
    date: new Date(r.date), shiftName: r.shift?.name ?? '', status: buildStatus(r),
    checkin: fmtT(r.checkinTime), checkout: fmtT(r.checkoutTime),
    hours: r.workingHours ? Number(r.workingHours).toFixed(2) : '',
    late: late || '', early: early || '', note: buildNote(r), request: requestLabel(r.corrections?.[0]?.status),
  };
}

/** Rows for a working day with no attendance record: leave overlay, else "Không chấm công". */
function absentRow(emp: any, date: Date, lr: any | undefined): DetailRow {
  const base = {
    empCode: emp.code ?? '', empName: emp.fullName ?? '',
    branchName: emp.branch?.name ?? '', deptName: emp.department?.name ?? '',
    date, shiftName: '', checkin: '', checkout: '', hours: '', late: '' as const, early: '' as const,
    note: '', request: '',
  };
  if (!lr) return { ...base, status: 'Không chấm công' };
  const typeLabel = LEAVE_TYPE_LABEL[lr.type] ?? lr.type ?? '';
  return { ...base, status: `Nghỉ phép (${typeLabel} · ${lr.isHalfDay ? 'Nửa ngày' : 'Cả ngày'})` };
}

export function buildAttendanceDetailSheet(
  wb: ExcelJS.Workbook,
  employees: any[],
  records: any[],
  leaveReqs: any[],
  calMap: Map<string, { type: string }>,
  start: Date,
  end: Date,
  workingMode: 'FIXED' | 'SHIFT',
  scheduledKeySet: Set<string>,
) {
  const recordsByKey = new Map<string, any[]>();
  records.forEach((r) => {
    if (!r.employee) return;
    const key = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
    if (!recordsByKey.has(key)) recordsByKey.set(key, []);
    recordsByKey.get(key)!.push(r);
  });
  const leaveByKey = new Map<string, any>();
  leaveReqs.forEach((lr) => {
    if (!lr.employeeId || !lr.fromDate || !lr.toDate || lr.status !== 'approved') return;
    for (let d = new Date(Math.max(new Date(lr.fromDate).getTime(), start.getTime())); d <= end && d <= lr.toDate; d.setDate(d.getDate() + 1)) {
      leaveByKey.set(`${lr.employeeId}_${localDateStr(d)}`, lr);
    }
  });

  const rows: DetailRow[] = [];
  for (const emp of employees) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = localDateStr(d);
      const key = `${emp.id}_${ds}`;
      const empRecords = recordsByKey.get(key);
      if (empRecords?.length) {
        empRecords.forEach((r) => rows.push(recordToRow(r, emp)));
        continue;
      }
      // FIXED: expected days come from the office calendar. SHIFT: CC schedules can span
      // 7 days/week, so "expected" means actually scheduled for that date (EmployeeShiftSchedule).
      let isWorking: boolean;
      if (workingMode === 'SHIFT') {
        isWorking = scheduledKeySet.has(key);
      } else {
        const cal = calMap.get(ds), dow = d.getDay();
        isWorking = cal ? cal.type === 'WORKING' || cal.type === 'COMPENSATION' : dow !== 0 && dow !== 6;
      }
      const lr = leaveByKey.get(key);
      if (lr) rows.push(absentRow(emp, new Date(d), lr));
      else if (isWorking) rows.push(absentRow(emp, new Date(d), undefined));
    }
  }

  const ws = wb.addWorksheet('Chi tiết chấm công');
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const groupFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEEF1EE' } };
  const lateFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFBE9E4' } };
  const earlyFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE6EEF6' } };

  const COLS = [
    { h: 'Mã NV', w: 12 }, { h: 'Họ tên', w: 22 }, { h: 'Chi nhánh', w: 12 }, { h: 'Phòng ban', w: 18 },
    { h: 'Ngày', w: 10 }, { h: 'Thứ', w: 6 }, { h: 'Ca', w: 16 }, { h: 'Trạng thái', w: 40 },
    { h: 'Vào', w: 9 }, { h: 'Ra', w: 9 }, { h: 'Tổng giờ', w: 9 },
    { h: 'Trễ (phút)', w: 10 }, { h: 'Sớm (phút)', w: 10 }, { h: 'Ghi chú', w: 32 }, { h: 'Yêu cầu', w: 12 },
  ];
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
  const LATE_CI = 11, EARLY_CI = 12; // 0-based data-array index of Trễ/Sớm

  ws.mergeCells(1, 1, 1, COLS.length);
  const title = ws.getCell(1, 1);
  title.value = 'CHI TIẾT CHẤM CÔNG';
  title.font = { bold: true, size: 13 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, COLS.length);
  const subtitle = ws.getCell(2, 1);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  subtitle.value = `${fmt(start)} — ${fmt(end)}  |  ${rows.length} dòng`;
  subtitle.font = { size: 10, italic: true, color: { argb: 'FF666666' } };
  subtitle.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  const headerRowIdx = 3;
  COLS.forEach((c, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1);
    cell.value = c.h; cell.border = border;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = groupFill;
  });

  let rowIdx = headerRowIdx + 1;
  let lastEmpCode: string | null = null;
  for (const r of rows) {
    if (r.empCode !== lastEmpCode) {
      ws.mergeCells(rowIdx, 1, rowIdx, COLS.length);
      const g = ws.getCell(rowIdx, 1);
      g.value = `${r.empCode} — ${r.empName} · ${r.branchName} · ${r.deptName}`;
      g.font = { bold: true, size: 9.5 };
      g.fill = groupFill; g.border = border;
      rowIdx++;
      lastEmpCode = r.empCode;
    }
    const row = ws.getRow(rowIdx);
    const vals = [
      r.empCode, r.empName, r.branchName, r.deptName,
      `${String(r.date.getDate()).padStart(2, '0')}/${String(r.date.getMonth() + 1).padStart(2, '0')}`,
      DOW_VI[r.date.getDay()], r.shiftName, r.status, r.checkin, r.checkout, r.hours, r.late, r.early, r.note, r.request,
    ];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v; cell.border = border;
      cell.font = { size: 9 };
      cell.alignment = { horizontal: ci <= 6 || ci === 10 || ci === LATE_CI || ci === EARLY_CI || ci === 14 ? 'center' : 'left', vertical: 'middle', wrapText: ci === 7 };
      if (ci === LATE_CI && r.late) cell.fill = lateFill;
      if (ci === EARLY_CI && r.early) cell.fill = earlyFill;
    });
    rowIdx++;
  }

  if (rows.length === 0) {
    ws.mergeCells(rowIdx, 1, rowIdx, COLS.length);
    const empty = ws.getCell(rowIdx, 1);
    empty.value = 'Không có dữ liệu chấm công trong khoảng thời gian này.';
    empty.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
}
