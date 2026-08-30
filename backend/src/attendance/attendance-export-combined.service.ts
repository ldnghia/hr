/**
 * AttendanceExportCombinedService — Excel export with 2 sheets:
 *   Sheet 1: "Bảng Chấm Công"   — employee × day matrix (grid)
 *   Sheet 2: "Báo Cáo Ngày Công" — per-employee working-day totals (summary)
 *
 * Used by both FIXED (export-grid) and SHIFT (export-summary) endpoints.
 * The workingMode param filters employees to only those in the active report.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceQueryService } from './attendance-query.service';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { formatDate } from '../common/utils/format';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { buildLateEarlySheet } from './attendance-export-late-early-sheet';
import { buildAttendanceDetailSheet } from './attendance-export-detail-sheet';

const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface DaySlot {
  checkinTime: Date | null;
  checkoutTime: Date | null;
  isOnLeave: boolean;
  isHalfDay: boolean;
  halfDaySession: string | null; // 'first' | 'last' | null
  totalWorkingHours: number;
  sessionsCount: number;
}

interface EmployeeSummary {
  emp: any;
  ngayCong: number;
  totalHours: number;
  totalSessions: number;
  lateDays: number;
  earlyDays: number;
  correctedDays: number;
  scheduledShifts: number; // total shifts assigned in EmployeeShiftSchedule
  shiftSang: number;   // morning sessions (S)
  shiftChieu: number;  // afternoon sessions (C)
  shiftToi: number;    // evening/night sessions (D)
  annual: number; sick: number; comp: number; unpaid: number; holiday: number; unexcused: number; total: number;
}

/** Mirror of frontend deriveShiftCode — classifies a shift as S/C/D from name then startTime */
function deriveShiftType(shift?: { name?: string; startTime?: string } | null): 'S' | 'C' | 'D' {
  if (!shift) return 'D';
  const name = (shift.name || '').toLowerCase();
  if (name.includes('sáng') || name.includes('sang') || name.includes('morning') || name.includes('s1') || name.includes('ca s')) return 'S';
  if (name.includes('chiều') || name.includes('chieu') || name.includes('afternoon') || name.includes('ca c')) return 'C';
  if (name.includes('đêm') || name.includes('dem') || name.includes('night') || name.includes('ca d') || name.includes('ca đ')) return 'D';
  const h = parseInt((shift.startTime || '0:0').split(':')[0], 10);
  if (h >= 5 && h < 11) return 'S';
  if (h >= 11 && h < 18) return 'C';
  return 'D';
}

/**
 * Grid slot for SHIFT-mode (CC): tracks S/C/T presence per (employee, date).
 * Classification by shift.startTime: S < 12:00, C 12–18, T ≥ 18.
 */
interface ShiftDaySlot {
  S: boolean; C: boolean; T: boolean; isOnLeave: boolean;
  corrected: { S: boolean; C: boolean; T: boolean };
}

function classifyShiftSCT(startTime?: string | null): 'S' | 'C' | 'T' {
  if (!startTime) return 'S';
  const [h, m] = startTime.split(':').map(Number);
  const mins = h * 60 + (m || 0);
  if (mins < 12 * 60) return 'S';
  if (mins < 18 * 60) return 'C';
  return 'T';
}

const thin = { style: 'thin' as const };
const BORDER         = { top: thin, left: thin, bottom: thin, right: thin };
const SUN_FILL       = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFDE8E8' } };
const LEAVE_FILL     = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } };
const CORRECTED_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8D0FF' } };

@Injectable()
export class AttendanceExportCombinedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: AttendanceQueryService,
  ) {}

  async exportCombined(
    dto: ReportAttendanceDto,
    workingMode: 'FIXED' | 'SHIFT',
    user: { id: number; role: string },
    res: Response,
  ) {
    // Parse date strings as UTC midnight to avoid local-timezone shift on UTC+7 servers.
    const now = new Date();
    const start = dto.dateFrom ? new Date(dto.dateFrom) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end   = dto.dateTo   ? new Date(dto.dateTo)   : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Build days array for the period
    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));

    // ── Shared data fetch ─────────────────────────────────────────────────────
    const excludeAttendanceExempt = await this.queryService.isAttendanceExemptExcludedFromReports();
    const [{ data: records }, allEmployees] = await Promise.all([
      this.queryService.getReport(
        { ...dto, page: 1, limit: 10000, isLate: undefined, isEarlyOut: undefined, isOvertime: undefined },
        user,
        workingMode,
      ),
      // Fetch ALL active employees with this workingMode (including those with no attendance)
      this.prisma.employee.findMany({
        where: {
          // Match frontend filter: status='official', workingMode exact match.
          // For FIXED: also include employees with null workingMode (schema default = FIXED).
          status: 'official',
          ...(workingMode === 'FIXED'
            ? { OR: [{ workingMode: 'FIXED' }, { workingMode: null }] }
            : { workingMode: 'SHIFT' }),
          ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
          ...(excludeAttendanceExempt ? { attendanceExempt: false } : {}),
        },
        select: {
          id: true, code: true, fullName: true,
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { code: 'asc' },
      }),
    ]);

    // Build employee map from the status-filtered list ONLY.
    // Records may contain resigned/inactive employees (historical data) — do NOT add them.
    // Only enrich existing entries with richer attendance-query data (which has more fields).
    const empMap = new Map<number, any>();
    allEmployees.forEach((e) => empMap.set(e.id, e));
    records.forEach((r: any) => {
      if (r.employee && empMap.has(r.employee.id)) empMap.set(r.employee.id, r.employee);
    });
    // Sort by department name first, then employee code
    const employees = [...empMap.values()].sort((a, b) => {
      const dCmp = (a.department?.name || '').localeCompare(b.department?.name || '', 'vi');
      return dCmp !== 0 ? dCmp : (a.code || '').localeCompare(b.code || '');
    });

    const empIds = employees.map((e) => e.id);

    // Fetch leave request half-day info to determine correct P count in FIXED mode
    const leaveRequestIds = [...new Set(
      records.filter((r: any) => r.leaveRequestId).map((r: any) => r.leaveRequestId as number),
    )];
    const leaveHalfDayMap = new Map<number, { isHalfDay: boolean; halfDaySession: string | null }>();
    if (leaveRequestIds.length > 0) {
      const lrList = await this.prisma.leaveRequest.findMany({
        where: { id: { in: leaveRequestIds } },
        select: { id: true, isHalfDay: true, halfDaySession: true },
      });
      lrList.forEach((lr) => leaveHalfDayMap.set(lr.id, { isHalfDay: lr.isHalfDay ?? false, halfDaySession: lr.halfDaySession ?? null }));
    }

    // Grid lookup: empId_date → DaySlot
    const lookup = new Map<string, DaySlot>();
    records.forEach((r: any) => {
      const key = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
      const h = r.workingHours ? Number(r.workingHours) : 0;
      const lrInfo = r.leaveRequestId ? (leaveHalfDayMap.get(r.leaveRequestId) ?? null) : null;
      const isHalfDay = lrInfo?.isHalfDay ?? false;
      const halfDaySession = lrInfo?.halfDaySession ?? null;
      const existing = lookup.get(key);
      if (!existing) {
        lookup.set(key, {
          checkinTime:  r.checkinTime  ? new Date(r.checkinTime)  : null,
          checkoutTime: r.checkoutTime ? new Date(r.checkoutTime) : null,
          isOnLeave: !!r.isOnLeave, isHalfDay, halfDaySession, totalWorkingHours: h, sessionsCount: 1,
        });
      } else {
        if (r.checkinTime)  { const t = new Date(r.checkinTime);  if (!existing.checkinTime  || t < existing.checkinTime)  existing.checkinTime  = t; }
        if (r.checkoutTime) { const t = new Date(r.checkoutTime); if (!existing.checkoutTime || t > existing.checkoutTime) existing.checkoutTime = t; }
        existing.isOnLeave = existing.isOnLeave || !!r.isOnLeave;
        if (isHalfDay) { existing.isHalfDay = true; existing.halfDaySession = halfDaySession; }
        existing.totalWorkingHours += h;
        existing.sessionsCount += 1;
      }
    });

    // SHIFT-mode grid lookup: S/C/T presence per (emp, date)
    const shiftLookup = new Map<string, ShiftDaySlot>();
    if (workingMode === 'SHIFT') {
      records.forEach((r: any) => {
        const key = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
        if (!shiftLookup.has(key)) shiftLookup.set(key, { S: false, C: false, T: false, isOnLeave: false, corrected: { S: false, C: false, T: false } });
        const s = shiftLookup.get(key)!;
        if (r.isOnLeave) {
          s.isOnLeave = true;
        } else if (r.checkinTime || r.checkoutTime) {
          const slot = classifyShiftSCT(r.shift?.startTime);
          s[slot] = true;
          if (r.isCorrected) s.corrected[slot] = true;
        }
      });
    }

    // Shift schedule count per employee (for SHIFT mode "Số ca đã phân" column) +
    // per (employee, date) key set — used by the detail sheet to know which days a
    // SHIFT employee was actually expected to work (CC schedules can span 7 days/week,
    // so calendar working-day logic doesn't apply there).
    const scheduleCountMap = new Map<number, number>();
    const scheduledKeySet = new Set<string>();
    if (workingMode === 'SHIFT' && empIds.length > 0) {
      const schedules = await this.prisma.employeeShiftSchedule.findMany({
        where: {
          employeeId: { in: empIds },
          date: { gte: start, lte: end },
        },
        select: { employeeId: true, date: true },
      });
      schedules.forEach((s) => {
        scheduleCountMap.set(s.employeeId, (scheduleCountMap.get(s.employeeId) ?? 0) + 1);
        scheduledKeySet.add(`${s.employeeId}_${localDateStr(new Date(s.date))}`);
      });
    }

    // Calendar days + official counts
    const calDays = await this.prisma.calendarDay.findMany({ where: { date: { gte: start, lte: end } } });
    const calMap = new Map(calDays.map((d) => [localDateStr(new Date(d.date)), d]));
    let officialWorkingDays = 0, officialHolidayDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = localDateStr(d), cal = calMap.get(ds), dow = d.getDay();
      if (!cal) { if (dow !== 0 && dow !== 6) officialWorkingDays++; continue; }
      if (cal.type === 'WORKING' || cal.type === 'COMPENSATION') officialWorkingDays++;
      else if (cal.type === 'HOLIDAY' && cal.isPaid) officialHolidayDays++;
    }

    // Leave requests (approved, filtered to employees in this report)
    const leaveReqs = empIds.length > 0 ? await this.prisma.leaveRequest.findMany({
      where: {
        status: 'approved',
        employeeId: { in: empIds },
        OR: [
          { fromDate: { gte: start, lte: end } },
          { toDate:   { gte: start, lte: end } },
          { fromDate: { lte: start }, toDate: { gte: end } },
        ],
      },
      include: { employee: { select: { id: true, code: true, fullName: true, position: { select: { name: true } } } } },
    }) : [];

    // Overlay leave onto the SHIFT grid for days with no attendance row (e.g. leave approved
    // before the shift schedule existed for that day — see leave-approval.service.ts finalise()).
    // Full-day leave marks all S/C/T cells as 'P', matching how a real isOnLeave attendance row renders.
    if (workingMode === 'SHIFT') {
      for (const lr of leaveReqs) {
        if (!lr.employeeId || !lr.fromDate || !lr.toDate) continue;
        const cursor = new Date(lr.fromDate);
        const lrEnd = new Date(lr.toDate);
        while (cursor <= lrEnd) {
          if (cursor >= start && cursor <= end) {
            const key = `${lr.employeeId}_${localDateStr(cursor)}`;
            const existing = shiftLookup.get(key);
            if (existing) existing.isOnLeave = true;
            else shiftLookup.set(key, { S: false, C: false, T: false, isOnLeave: true, corrected: { S: false, C: false, T: false } });
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    // Attendance day sets
    const attDaySet        = new Map<string, boolean>();
    const attHoursMap      = new Map<number, number>();
    const attSessionsMap   = new Map<number, number>();
    const lateMap          = new Map<number, number>();
    const earlyMap         = new Map<number, number>();
    const correctedDaySet  = new Set<string>(); // "empId_date" — distinct corrected days
    const shiftSangMap     = new Map<number, number>();
    const shiftChieuMap    = new Map<number, number>();
    const shiftToiMap      = new Map<number, number>();
    records.forEach((r: any) => {
      if (r.checkinTime && !r.isOnLeave) {
        const dayKey = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
        attDaySet.set(dayKey, true);
        attHoursMap.set(r.employeeId, (attHoursMap.get(r.employeeId) ?? 0) + (r.workingHours ? Number(r.workingHours) : 0));
        attSessionsMap.set(r.employeeId, (attSessionsMap.get(r.employeeId) ?? 0) + 1);
        if (r.isLate)      lateMap.set(r.employeeId,  (lateMap.get(r.employeeId)  ?? 0) + 1);
        if (r.isEarlyOut)  earlyMap.set(r.employeeId, (earlyMap.get(r.employeeId) ?? 0) + 1);
        if (r.isCorrected) correctedDaySet.add(dayKey);
        const st = deriveShiftType(r.shift);
        if (st === 'S') shiftSangMap.set(r.employeeId,  (shiftSangMap.get(r.employeeId)  ?? 0) + 1);
        if (st === 'C') shiftChieuMap.set(r.employeeId, (shiftChieuMap.get(r.employeeId) ?? 0) + 1);
        if (st === 'D') shiftToiMap.set(r.employeeId,   (shiftToiMap.get(r.employeeId)   ?? 0) + 1);
      }
    });

    // Per-employee summaries
    const summaries: EmployeeSummary[] = employees.map((emp) => {
      let ngayCong = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = localDateStr(d), cal = calMap.get(ds), dow = d.getDay();
        const isWorking = cal ? cal.type === 'WORKING' || cal.type === 'COMPENSATION' : dow !== 0 && dow !== 6;
        if (isWorking && attDaySet.get(`${emp.id}_${ds}`)) ngayCong++;
      }
      const totalHours    = parseFloat((attHoursMap.get(emp.id) ?? 0).toFixed(2));
      const totalSessions = attSessionsMap.get(emp.id) ?? 0;
      const lateDays      = lateMap.get(emp.id)  ?? 0;
      const earlyDays     = earlyMap.get(emp.id) ?? 0;
      const correctedDays = [...correctedDaySet].filter(k => k.startsWith(`${emp.id}_`)).length;
      const empLeaves     = leaveReqs.filter((lr) => lr.employeeId === emp.id);
      const leaveDays     = (type: string) => empLeaves.filter((l) => l.type === type).reduce((s, l) => s + Number(l.days || 0), 0);
      const annual = leaveDays('annual'), sick = leaveDays('sick'), comp = leaveDays('compensatory'), unpaid = leaveDays('unpaid');
      const accounted = ngayCong + annual + sick + comp + unpaid + officialHolidayDays;
      return {
        emp, ngayCong, totalHours, totalSessions, lateDays, earlyDays, correctedDays,
        scheduledShifts: scheduleCountMap.get(emp.id) ?? 0,
        shiftSang:  shiftSangMap.get(emp.id)  ?? 0,
        shiftChieu: shiftChieuMap.get(emp.id) ?? 0,
        shiftToi:   shiftToiMap.get(emp.id)   ?? 0,
        annual, sick, comp, unpaid,
        holiday: officialHolidayDays,
        unexcused: Math.max(0, officialWorkingDays - accounted),
        total: parseFloat((ngayCong + annual + officialHolidayDays + sick + comp).toFixed(1)),
      };
    });

    // ── Build workbook ────────────────────────────────────────────────────────
    // Pre-compute corrected days for FIXED mode (empId_date keys)
    const fixedCorrectedSet = new Set<string>();
    if (workingMode === 'FIXED') {
      records.forEach((r: any) => {
        if (r.isCorrected) fixedCorrectedSet.add(`${r.employeeId}_${localDateStr(new Date(r.date))}`);
      });
    }

    // Office location totals — gated on GPS presence (checkinLat/checkoutLat != null) so
    // sessions without any GPS data (old records, or manual reason-only check-in/out) are
    // excluded rather than miscounted as "outside" (isInOffice defaults to false, not null).
    const officeTotals = {
      checkinInOffice:  records.filter((r: any) => r.checkinTime && !r.isOnLeave && r.checkinLat != null && r.isInOffice).length,
      checkinOutside:   records.filter((r: any) => r.checkinTime && !r.isOnLeave && r.checkinLat != null && !r.isInOffice).length,
      checkoutInOffice: records.filter((r: any) => r.checkoutTime && r.checkoutLat != null && r.checkoutIsInOffice).length,
      checkoutOutside:  records.filter((r: any) => r.checkoutTime && r.checkoutLat != null && !r.checkoutIsInOffice).length,
    };

    const wb = new ExcelJS.Workbook();
    this.addGridSheet(wb, employees, days, lookup, workingMode, shiftLookup, fixedCorrectedSet);
    this.addSummarySheet(wb, summaries, start, end, officialWorkingDays, officialHolidayDays, workingMode, officeTotals);
    buildLateEarlySheet(wb, records);
    buildAttendanceDetailSheet(wb, employees, records, leaveReqs, calMap, start, end, workingMode, scheduledKeySet);

    const month = String(start.getMonth() + 1).padStart(2, '0');
    const year  = start.getFullYear();
    const label = workingMode === 'SHIFT' ? 'Command_Center' : 'Ca_Co_Dinh';
    const filename = `Bao_Cao_Cham_Cong_${label}_${month}_${year}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    await wb.xlsx.write(res);
    res.end();
  }

  // ── Sheet 1: grid (employee × day matrix) ────────────────────────────────

  private addGridSheet(
    wb: ExcelJS.Workbook,
    employees: any[],
    days: Date[],
    lookup: Map<string, DaySlot>,
    workingMode: 'FIXED' | 'SHIFT',
    shiftLookup: Map<string, ShiftDaySlot>,
    fixedCorrectedSet: Set<string>,
  ) {
    const ws  = wb.addWorksheet('Bảng Chấm Công');
    const FIX = 4; // STT | HỌ VÀ TÊN | Chức vụ | Phòng ban
    // SHIFT: 3 sub-cols/day (S/C/T); FIXED: 2 sub-cols/day (S/C = checkin/checkout)
    const SUB = workingMode === 'SHIFT' ? 3 : 2;

    const applyCell = (cell: ExcelJS.Cell, val: any, font?: any, fill?: any, align?: any) => {
      cell.value = val;
      cell.border = BORDER;
      cell.alignment = align ?? { horizontal: 'center', vertical: 'middle' };
      if (font) cell.font = font;
      if (fill) cell.fill = fill;
    };
    ws.getColumn(1).width = 5; ws.getColumn(2).width = 22; ws.getColumn(3).width = 14; ws.getColumn(4).width = 18;
    [1, 2, 3].forEach((r) => { ws.getRow(r).height = 18; });
    ['STT', 'HỌ VÀ TÊN', 'Chức vụ', 'Phòng ban'].forEach((label, ci) => {
      ws.mergeCells(1, ci + 1, 3, ci + 1);
      applyCell(ws.getCell(1, ci + 1), label, { bold: true, size: 9 });
    });

    // Alternating day-group fill by day index (di % 2) — lowest priority, purely visual separation.
    // CN overrides with SUN_FILL regardless of index.
    const ALT_DAY_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F4F8' } };

    const subLabels = workingMode === 'SHIFT' ? ['S', 'C', 'T'] : ['S', 'C'];
    days.forEach((day, i) => {
      const colS = FIX + 1 + i * SUB, dow = day.getDay(), isSun = dow === 0;
      const dowLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow];
      const fSun  = { bold: true, size: 9, color: { argb: 'FFCC0000' } };
      const fNorm = { bold: true, size: 9 };
      const isSat = dow === 6;
      const isWeekend = isSun || (workingMode === 'FIXED' && isSat);
      const headerFill = isWeekend ? SUN_FILL : (i % 2 === 1 ? ALT_DAY_FILL : undefined);
      const fHeader = isWeekend ? fSun : fNorm;
      // Row 1: day-of-week label spans SUB sub-cols
      ws.mergeCells(1, colS, 1, colS + SUB - 1);
      applyCell(ws.getCell(1, colS), dowLabel, fHeader, headerFill);
      // Row 2: date number spans SUB sub-cols
      ws.mergeCells(2, colS, 2, colS + SUB - 1);
      applyCell(ws.getCell(2, colS), String(day.getDate()).padStart(2, '0'), fHeader, headerFill);
      // Row 3: sub-column labels
      subLabels.forEach((sc, si) => {
        ws.getColumn(colS + si).width = 4;
        applyCell(ws.getCell(3, colS + si), sc, fHeader, headerFill);
      });
    });

    // Track per-column totals for the totals row (col index → count of '/' marks)
    const colTotals = new Map<number, number>();

    employees.forEach((emp, idx) => {
      const row = ws.getRow(4 + idx); row.height = 16;
      [idx + 1, emp.fullName || '', emp.position?.name || '', emp.department?.name || ''].forEach((v, ci) => {
        applyCell(row.getCell(ci + 1), v, { size: 9 }, undefined, { horizontal: ci === 0 ? 'center' : 'left', vertical: 'middle' });
      });
      days.forEach((day, di) => {
        const ds    = localDateStr(day);
        const colS  = FIX + 1 + di * SUB;
        const isSun = day.getDay() === 0;

        const isSat2 = day.getDay() === 6;
        const dayFill = (isSun || (workingMode === 'FIXED' && isSat2)) ? SUN_FILL : (di % 2 === 1 ? ALT_DAY_FILL : undefined);

        if (workingMode === 'SHIFT') {
          const s = shiftLookup.get(`${emp.id}_${ds}`);
          const isLeave = s?.isOnLeave ?? false;
          (['S', 'C', 'T'] as const).forEach((k, si) => {
            let val = '';
            if (s) { val = s.isOnLeave ? 'P' : s[k] ? '/' : ''; }
            if (val === '/') colTotals.set(colS + si, (colTotals.get(colS + si) ?? 0) + 1);
            const isCorrected = s?.corrected[k] ?? false;
            applyCell(row.getCell(colS + si), val,
              isLeave ? { bold: true, size: 9, color: { argb: 'FFCC6600' } } : { size: 9 },
              isCorrected ? CORRECTED_FILL : isLeave ? LEAVE_FILL : dayFill,
            );
          });
        } else {
          // FIXED: S=checkin, C=checkout
          const slot = lookup.get(`${emp.id}_${ds}`);
          const isLeave     = slot?.isOnLeave ?? false;
          const isCorrected = fixedCorrectedSet.has(`${emp.id}_${ds}`);
          let sVal = '', cVal = '';
          if (slot) {
            if (slot.isOnLeave && slot.isHalfDay) {
              // Half-day leave: use halfDaySession to determine which half is leave.
              // 'first' = nửa ca đầu (S='P', C='/' if checkout exists)
              // 'last'  = nửa ca cuối (S='/' if checkin exists, C='P')
              // fallback: infer from checkin presence
              const session = slot.halfDaySession;
              const isFirst = session === 'first' || (!session && !slot.checkinTime);
              if (isFirst) {
                sVal = 'P';
                if (slot.checkoutTime) cVal = '/';
              } else {
                if (slot.checkinTime) sVal = '/';
                cVal = 'P';
              }
            } else if (slot.isOnLeave) {
              // Full-day leave
              sVal = 'P'; cVal = 'P';
            } else {
              if (slot.checkinTime)  sVal = slot.sessionsCount > 1 ? `/${slot.sessionsCount}` : '/';
              if (slot.checkoutTime) cVal = '/';
            }
          }
          if (sVal === '/') colTotals.set(colS,     (colTotals.get(colS)     ?? 0) + 1);
          if (cVal === '/') colTotals.set(colS + 1, (colTotals.get(colS + 1) ?? 0) + 1);
          [sVal, cVal].forEach((v, si) => {
            applyCell(row.getCell(colS + si), v,
              isLeave ? { bold: true, size: 9, color: { argb: 'FFCC6600' } } : { size: 9 },
              isCorrected ? CORRECTED_FILL : isLeave ? LEAVE_FILL : dayFill,
            );
          });
        }
      });
    });

    // Totals row — only for SHIFT (CC) mode
    if (workingMode === 'SHIFT') {
      const totalRowIdx = 4 + employees.length;
      const totalRow = ws.getRow(totalRowIdx);
      totalRow.height = 18;
      ws.mergeCells(totalRowIdx, 1, totalRowIdx, FIX);
      applyCell(totalRow.getCell(1), 'Tổng ca làm việc', { bold: true, size: 9 });
      days.forEach((day, di) => {
        const colS  = FIX + 1 + di * SUB;
        const isSun   = day.getDay() === 0;
        const dayFill = isSun ? SUN_FILL : (di % 2 === 1 ? ALT_DAY_FILL : undefined);
        for (let si = 0; si < SUB; si++) {
          const col   = colS + si;
          const total = colTotals.get(col) ?? 0;
          applyCell(totalRow.getCell(col), total || '',
            { bold: true, size: 9, ...(isSun ? { color: { argb: 'FFCC0000' } } : {}) },
            dayFill,
          );
        }
      });
    }
  }

  // ── Sheet 2: summary (working-day totals per employee) ───────────────────

  private addSummarySheet(
    wb: ExcelJS.Workbook, summaries: EmployeeSummary[],
    start: Date, end: Date, officialWorkingDays: number, officialHolidayDays: number,
    workingMode: 'FIXED' | 'SHIFT',
    officeTotals: { checkinInOffice: number; checkinOutside: number; checkoutInOffice: number; checkoutOutside: number },
  ) {
    const ws = wb.addWorksheet('Báo Cáo Ngày Công');
    // FIXED: Ngày công | Đi trễ | Về sớm | Chỉnh sửa
    // SHIFT: Ca làm | Đi trễ | Về sớm | Chỉnh sửa | Ca sáng | Ca chiều | Ca tối
    //        (no Ngày công col — CC works all 7 days, weekend counting is ambiguous)
    const FIXED_COLS = [
      { h: 'Ngày\ncông',      w: 8 },
      { h: 'Đi\ntrễ',        w: 7 },
      { h: 'Về\nsớm',        w: 7 },
      { h: 'Ngày\nchỉnh sửa', w: 9 },
    ];
    const SHIFT_COLS = [
      { h: 'Ca\nđã phân', w: 8 },
      { h: 'Ca\nlàm',     w: 7 },
      { h: 'Đi\ntrễ',    w: 7 },
      { h: 'Về\nsớm',    w: 7 },
      { h: 'Chỉnh\nsửa',  w: 8 },
      { h: 'Ca\nsáng',   w: 7 },
      { h: 'Ca\nchiều',  w: 7 },
      { h: 'Ca\ntối',    w: 7 },
    ];
    const MODE_COLS = workingMode === 'FIXED' ? FIXED_COLS : SHIFT_COLS;
    const BASE_LEAVE_COLS = [
      { h: 'Nghỉ phép\nnăm', w: 10 }, { h: 'Nghỉ\nốm', w: 8 }, { h: 'Nghỉ\nbù', w: 8 },
      { h: 'Nghỉ không\nlương', w: 11 }, { h: 'Nghỉ\nlễ, Tết', w: 9 },
      { h: 'Nghỉ không\nlý do', w: 11 },
    ];
    // FIXED keeps "Cộng ngày công hưởng"; SHIFT omits it (CC report focuses on shift counts)
    const LEAVE_COLS = workingMode === 'FIXED'
      ? [...BASE_LEAVE_COLS, { h: 'Cộng ngày\ncông hưởng', w: 12 }]
      : BASE_LEAVE_COLS;
    const COLS = [
      { h: 'STT', w: 5 }, { h: 'Họ và tên', w: 22 }, { h: 'Chức vụ', w: 14 }, { h: 'Phòng ban', w: 18 },
      ...MODE_COLS, ...LEAVE_COLS,
    ];
    // FIXED: "Nghỉ không lý do" is 2nd-to-last, "Cộng" is last
    // SHIFT: "Nghỉ không lý do" is the last col (no Cộng)
    const ciUnexcused = workingMode === 'FIXED' ? COLS.length - 2 : COLS.length - 1;
    const ciTotal     = workingMode === 'FIXED' ? COLS.length - 1 : -1; // -1 = no total col for SHIFT
    // First mode-specific col index (after 4 fixed cols: STT/Tên/Chức vụ/Phòng ban)
    const ciModeStart = 4;
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });

    // Title
    ws.mergeCells(1, 1, 1, COLS.length);
    const tc = ws.getCell(1, 1);
    tc.value = `BÁO CÁO NGÀY CÔNG THÁNG ${start.getMonth() + 1}/${start.getFullYear()}`;
    tc.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    tc.alignment = { horizontal: 'center', vertical: 'middle' };
    tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3949AB' } };
    ws.getRow(1).height = 28;

    // Subtitle
    ws.mergeCells(2, 1, 2, COLS.length);
    const sc = ws.getCell(2, 1);
    sc.value = workingMode === 'FIXED'
      ? `${formatDate(start)} — ${formatDate(end)}  |  Ngày làm việc: ${officialWorkingDays}  |  Ngày lễ: ${officialHolidayDays}`
      : `${formatDate(start)} — ${formatDate(end)}`;
    sc.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
    sc.alignment = { horizontal: 'center', vertical: 'middle' };
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };
    ws.getRow(2).height = 16;

    // Header
    ws.getRow(3).height = 36;
    COLS.forEach((c, i) => {
      const cell = ws.getCell(3, i + 1);
      cell.value = c.h; cell.border = BORDER;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBC8F5' } };
    });

    // Data rows
    summaries.forEach((s, idx) => {
      const row = ws.getRow(4 + idx); row.height = 16;
      const modeVals = workingMode === 'FIXED'
        ? [s.ngayCong, s.lateDays, s.earlyDays, s.correctedDays]
        : [s.scheduledShifts, s.totalSessions, s.lateDays, s.earlyDays, s.correctedDays, s.shiftSang, s.shiftChieu, s.shiftToi];
      const vals = [idx + 1, s.emp.fullName || '', s.emp.position?.name || '', s.emp.department?.name || '',
        ...modeVals,
        // SHIFT omits s.total (no "Cộng ngày công hưởng" column)
        ...(workingMode === 'FIXED'
          ? [s.annual, s.sick, s.comp, s.unpaid, s.holiday, s.unexcused, s.total]
          : [s.annual, s.sick, s.comp, s.unpaid, s.holiday, s.unexcused])];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = typeof v === 'number' ? (v === 0 ? 0 : parseFloat(Number(v).toFixed(2))) : v;
        cell.border = BORDER;
        // ci→{textColor, bgColor} for mode-specific columns (>0 only)
        // FIXED mode: ci=4 Ngày công (no highlight), ci=5 Đi trễ, ci=6 Về sớm, ci=7 Chỉnh sửa
        // SHIFT mode: ci=4 Ca làm, ci=5 Đi trễ, ci=6 Về sớm, ci=7 Chỉnh sửa, ci=8-10 Ca Sáng/Chiều/Tối
        // FIXED: ci=4 Ngày công (no color), ci=5 Đi trễ, ci=6 Về sớm, ci=7 Chỉnh sửa
        // SHIFT: ci=4 Ca đã phân, ci=5 Ca làm, ci=6 Đi trễ, ci=7 Về sớm, ci=8 Chỉnh sửa, ci=9-11 Ca S/C/T
        const COLOR_MAP: Record<string, { text: string; bg: string }> = workingMode === 'FIXED'
          ? { 5: { text: 'FFE65100', bg: 'FFFFF3E0' },  // Đi trễ — orange
              6: { text: 'FF1565C0', bg: 'FFE3F2FD' },  // Về sớm — blue
              7: { text: 'FF6A1B9A', bg: 'FFF3E5F5' },  // Chỉnh sửa — purple
            }
          : { 4: { text: 'FF01579B', bg: 'FFE1F5FE' },  // Ca đã phân — light blue
              5: { text: 'FF2E7D32', bg: 'FFE8F5E9' },  // Ca làm — green
              6: { text: 'FFE65100', bg: 'FFFFF3E0' },  // Đi trễ — orange
              7: { text: 'FF1565C0', bg: 'FFE3F2FD' },  // Về sớm — blue
              8: { text: 'FF6A1B9A', bg: 'FFF3E5F5' },  // Chỉnh sửa — purple
              9: { text: 'FFF57F00', bg: 'FFFFF8E1' },  // Ca sáng — amber
             10: { text: 'FF00838F', bg: 'FFE0F7FA' },  // Ca chiều — teal
             11: { text: 'FF283593', bg: 'FFE8EAF6' },  // Ca tối — indigo
            };
        const colorCfg = (v as number) > 0 ? COLOR_MAP[String(ci)] : undefined;
        cell.font = {
          size: 9,
          ...(ci === ciUnexcused && (v as number) > 0 ? { bold: true, color: { argb: 'FFCC0000' } } : {}),
          ...(colorCfg ? { bold: true, color: { argb: colorCfg.text } } : {}),
          ...(typeof v === 'number' && v === 0 ? { color: { argb: 'FFAAAAAA' } } : {}),
        };
        cell.alignment = { horizontal: ci < 4 ? (ci === 0 ? 'center' : 'left') : 'center', vertical: 'middle' };
        if (ciTotal >= 0 && ci === ciTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEFF1' } };
        if (colorCfg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorCfg.bg } };
      });
    });

    // Totals row
    const ti = 4 + summaries.length;
    const tr = ws.getRow(ti); tr.height = 18;
    ws.mergeCells(ti, 1, ti, 4);
    const tl = tr.getCell(1);
    tl.value = 'TỔNG CỘNG'; tl.border = BORDER;
    tl.font = { bold: true, size: 9 };
    tl.alignment = { horizontal: 'center', vertical: 'middle' };
    tl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
    const sumFields: (keyof EmployeeSummary)[] = workingMode === 'FIXED'
      ? ['ngayCong', 'lateDays', 'earlyDays', 'correctedDays', 'annual', 'sick', 'comp', 'unpaid', 'holiday', 'unexcused', 'total']
      : ['scheduledShifts', 'totalSessions', 'lateDays', 'earlyDays', 'correctedDays', 'shiftSang', 'shiftChieu', 'shiftToi', 'annual', 'sick', 'comp', 'unpaid', 'holiday', 'unexcused'];
    sumFields.forEach((field, i) => {
        const cell = tr.getCell(5 + i); // col 5+ (after STT/Tên/ChứcVụ/PhòngBan)
        cell.value = parseFloat(summaries.reduce((a, s) => a + (s[field] as number), 0).toFixed(2));
        cell.border = BORDER;
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
      });

    // ── Office location totals block ──────────────────────────────────────
    const olTitleRow = ti + 2;
    ws.mergeCells(olTitleRow, 1, olTitleRow, COLS.length);
    const olTitle = ws.getCell(olTitleRow, 1);
    olTitle.value = 'TỔNG SỐ LẦN CHẤM CÔNG TRONG / NGOÀI VĂN PHÒNG';
    olTitle.font = { bold: true, size: 10 };
    olTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(olTitleRow).height = 20;

    const olLabelRow = olTitleRow + 1;
    const olValueRow = olTitleRow + 2;
    const olCols: { label: string; value: number; bg: string }[] = [
      { label: 'Vào trong VP',  value: officeTotals.checkinInOffice,  bg: 'FFE8F5E9' },
      { label: 'Vào ngoài VP',  value: officeTotals.checkinOutside,   bg: 'FFFFEBEE' },
      { label: 'Ra trong VP',   value: officeTotals.checkoutInOffice, bg: 'FFE8F5E9' },
      { label: 'Ra ngoài VP',   value: officeTotals.checkoutOutside,  bg: 'FFFFEBEE' },
    ];
    olCols.forEach((c, i) => {
      ws.mergeCells(olLabelRow, 1 + i * 2, olLabelRow, 2 + i * 2);
      const labelCell = ws.getCell(olLabelRow, 1 + i * 2);
      labelCell.value = c.label;
      labelCell.font = { bold: true, size: 9 };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      labelCell.border = BORDER;
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.bg } };

      ws.mergeCells(olValueRow, 1 + i * 2, olValueRow, 2 + i * 2);
      const valueCell = ws.getCell(olValueRow, 1 + i * 2);
      valueCell.value = c.value;
      valueCell.font = { bold: true, size: 12 };
      valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
      valueCell.border = BORDER;
      valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.bg } };
    });
    ws.getRow(olLabelRow).height = 16;
    ws.getRow(olValueRow).height = 22;
  }
}
