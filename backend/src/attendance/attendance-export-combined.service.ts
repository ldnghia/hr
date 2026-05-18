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

const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface DaySlot {
  checkinTime: Date | null;
  checkoutTime: Date | null;
  isOnLeave: boolean;
  totalWorkingHours: number;
  sessionsCount: number;
}

interface EmployeeSummary {
  emp: any;
  ngayCong: number;
  totalHours: number;
  totalSessions: number;
  annual: number; sick: number; comp: number; unpaid: number; holiday: number; unexcused: number; total: number;
}

const thin = { style: 'thin' as const };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const SUN_FILL  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFC7CE' } };
const LEAVE_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } };

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
    const start = dto.dateFrom ? new Date(dto.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end   = dto.dateTo   ? new Date(dto.dateTo)   : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // Build days array for the period
    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));

    // ── Shared data fetch ─────────────────────────────────────────────────────
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
        },
        select: {
          id: true, code: true, fullName: true,
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
        },
        orderBy: { code: 'asc' },
      }),
    ]);

    // Merge: all employees base list + enrich with attendance employee data (which has more fields from includes)
    const empMap = new Map<number, any>();
    allEmployees.forEach((e) => empMap.set(e.id, e));
    records.forEach((r: any) => { if (r.employee) empMap.set(r.employee.id, r.employee); });
    // Sort by department name first, then employee code
    const employees = [...empMap.values()].sort((a, b) => {
      const dCmp = (a.department?.name || '').localeCompare(b.department?.name || '', 'vi');
      return dCmp !== 0 ? dCmp : (a.code || '').localeCompare(b.code || '');
    });

    const empIds = employees.map((e) => e.id);

    // Grid lookup: empId_date → DaySlot
    const lookup = new Map<string, DaySlot>();
    records.forEach((r: any) => {
      const key = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
      const h = r.workingHours ? Number(r.workingHours) : 0;
      const existing = lookup.get(key);
      if (!existing) {
        lookup.set(key, {
          checkinTime:  r.checkinTime  ? new Date(r.checkinTime)  : null,
          checkoutTime: r.checkoutTime ? new Date(r.checkoutTime) : null,
          isOnLeave: !!r.isOnLeave, totalWorkingHours: h, sessionsCount: 1,
        });
      } else {
        if (r.checkinTime)  { const t = new Date(r.checkinTime);  if (!existing.checkinTime  || t < existing.checkinTime)  existing.checkinTime  = t; }
        if (r.checkoutTime) { const t = new Date(r.checkoutTime); if (!existing.checkoutTime || t > existing.checkoutTime) existing.checkoutTime = t; }
        existing.isOnLeave = existing.isOnLeave || !!r.isOnLeave;
        existing.totalWorkingHours += h;
        existing.sessionsCount += 1;
      }
    });

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

    // Attendance day sets
    const attDaySet   = new Map<string, boolean>();
    const attHoursMap = new Map<number, number>();
    const attSessionsMap = new Map<number, number>();
    records.forEach((r: any) => {
      if (r.checkinTime && !r.isOnLeave) {
        attDaySet.set(`${r.employeeId}_${localDateStr(new Date(r.date))}`, true);
        attHoursMap.set(r.employeeId, (attHoursMap.get(r.employeeId) ?? 0) + (r.workingHours ? Number(r.workingHours) : 0));
        attSessionsMap.set(r.employeeId, (attSessionsMap.get(r.employeeId) ?? 0) + 1);
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
      const empLeaves     = leaveReqs.filter((lr) => lr.employeeId === emp.id);
      const leaveDays     = (type: string) => empLeaves.filter((l) => l.type === type).reduce((s, l) => s + Number(l.days || 0), 0);
      const annual = leaveDays('annual'), sick = leaveDays('sick'), comp = leaveDays('compensatory'), unpaid = leaveDays('unpaid');
      const accounted = ngayCong + annual + sick + comp + unpaid + officialHolidayDays;
      return {
        emp, ngayCong, totalHours, totalSessions, annual, sick, comp, unpaid,
        holiday: officialHolidayDays,
        unexcused: Math.max(0, officialWorkingDays - accounted),
        total: parseFloat((ngayCong + annual + officialHolidayDays + sick + comp).toFixed(1)),
      };
    });

    // ── Build workbook ────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    this.addGridSheet(wb, employees, days, lookup);
    this.addSummarySheet(wb, summaries, start, end, officialWorkingDays, officialHolidayDays);

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

  private addGridSheet(wb: ExcelJS.Workbook, employees: any[], days: Date[], lookup: Map<string, DaySlot>) {
    const ws  = wb.addWorksheet('Bảng Chấm Công');
    const FIX = 4; // STT | HỌ VÀ TÊN | Chức vụ | Phòng ban
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
    days.forEach((day, i) => {
      const colS = FIX + 1 + i * 2, dow = day.getDay(), isSun = dow === 0;
      const dowLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow];
      const fSun  = { bold: true, size: 9, color: { argb: 'FFCC0000' } };
      const fNorm = { bold: true, size: 9 };
      ws.mergeCells(1, colS, 1, colS + 1);
      applyCell(ws.getCell(1, colS), dowLabel, isSun ? fSun : fNorm, isSun ? SUN_FILL : undefined);
      ws.mergeCells(2, colS, 2, colS + 1);
      applyCell(ws.getCell(2, colS), String(day.getDate()).padStart(2, '0'), isSun ? fSun : fNorm, isSun ? SUN_FILL : undefined);
      ['S', 'C'].forEach((sc, si) => {
        ws.getColumn(colS + si).width = 4;
        applyCell(ws.getCell(3, colS + si), sc, isSun ? fSun : fNorm, isSun ? SUN_FILL : undefined);
      });
    });
    employees.forEach((emp, idx) => {
      const row = ws.getRow(4 + idx); row.height = 16;
      [idx + 1, emp.fullName || '', emp.position?.name || '', emp.department?.name || ''].forEach((v, ci) => {
        applyCell(row.getCell(ci + 1), v, { size: 9 }, undefined, { horizontal: ci === 0 ? 'center' : 'left', vertical: 'middle' });
      });
      days.forEach((day, di) => {
        const slot = lookup.get(`${emp.id}_${localDateStr(day)}`);
        const colS = FIX + 1 + di * 2, isSun = day.getDay() === 0;
        let sVal = '', cVal = '', isLeave = false;
        if (slot) {
          if (slot.isOnLeave) { sVal = 'P'; cVal = 'P'; isLeave = true; }
          else {
            if (slot.checkinTime) sVal = slot.sessionsCount > 1 ? `/${slot.sessionsCount}` : '/';
            if (slot.checkoutTime) cVal = '/';
          }
        }
        [sVal, cVal].forEach((v, si) => {
          applyCell(row.getCell(colS + si), v,
            isLeave ? { bold: true, size: 9, color: { argb: 'FFCC6600' } } : { size: 9 },
            isLeave ? LEAVE_FILL : isSun ? SUN_FILL : undefined,
          );
        });
      });
    });
  }

  // ── Sheet 2: summary (working-day totals per employee) ───────────────────

  private addSummarySheet(
    wb: ExcelJS.Workbook, summaries: EmployeeSummary[],
    start: Date, end: Date, officialWorkingDays: number, officialHolidayDays: number,
  ) {
    const ws = wb.addWorksheet('Báo Cáo Ngày Công');
    const COLS = [
      { h: 'STT', w: 5 }, { h: 'Họ và tên', w: 22 }, { h: 'Chức vụ', w: 14 }, { h: 'Phòng ban', w: 18 },
      { h: 'Ngày\ncông', w: 8 }, { h: 'Giờ\ncông', w: 9 }, { h: 'Ca\nlàm', w: 7 },
      { h: 'Nghỉ phép\nnăm', w: 10 }, { h: 'Nghỉ\nốm', w: 8 }, { h: 'Nghỉ\nbù', w: 8 },
      { h: 'Nghỉ không\nlương', w: 11 }, { h: 'Nghỉ\nlễ, Tết', w: 9 },
      { h: 'Nghỉ không\nlý do', w: 11 }, { h: 'Cộng ngày\ncông hưởng', w: 12 },
    ];
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
    sc.value = `${formatDate(start)} — ${formatDate(end)}  |  Ngày làm việc: ${officialWorkingDays}  |  Ngày lễ: ${officialHolidayDays}`;
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

    // Data — cols: STT|Tên|Chức vụ|Phòng ban|ngayCong|totalHours|totalSessions|annual|sick|comp|unpaid|holiday|unexcused|total
    summaries.forEach((s, idx) => {
      const row = ws.getRow(4 + idx); row.height = 16;
      const vals = [idx + 1, s.emp.fullName || '', s.emp.position?.name || '', s.emp.department?.name || '',
        s.ngayCong, s.totalHours, s.totalSessions, s.annual, s.sick, s.comp,
        s.unpaid, s.holiday, s.unexcused, s.total];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = typeof v === 'number' ? (v === 0 ? 0 : parseFloat(Number(v).toFixed(2))) : v;
        cell.border = BORDER;
        // ci=12 → unexcused (red bold if > 0); ci=13 → total (highlight)
        cell.font = { size: 9, ...(ci === 12 && (v as number) > 0 ? { bold: true, color: { argb: 'FFCC0000' } } : {}), ...(typeof v === 'number' && v === 0 ? { color: { argb: 'FFAAAAAA' } } : {}) };
        cell.alignment = { horizontal: ci < 4 ? (ci === 0 ? 'center' : 'left') : 'center', vertical: 'middle' };
        if (ci === 13) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEFF1' } };
        if (ci === 5 && (v as number) > 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
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
    (['ngayCong', 'totalHours', 'totalSessions', 'annual', 'sick', 'comp', 'unpaid', 'holiday', 'unexcused', 'total'] as (keyof EmployeeSummary)[])
      .forEach((field, i) => {
        const cell = tr.getCell(5 + i); // col 5+ (after STT/Tên/ChứcVụ/PhòngBan)
        cell.value = parseFloat(summaries.reduce((a, s) => a + (s[field] as number), 0).toFixed(2));
        cell.border = BORDER;
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
      });
  }
}
