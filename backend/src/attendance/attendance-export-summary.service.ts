/**
 * AttendanceExportSummaryService — Excel summary report (working-day counts per employee).
 *
 * Multi-shift correctness:
 *  - totalWorkingDays  = DISTINCT dates with at least one check-in (a day with 2 shifts = 1 day)
 *  - totalWorkingHours = SUM(workingHours) across ALL sessions
 *  - totalSessions     = COUNT of individual attendance rows (for multi-shift visibility)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceQueryService } from './attendance-query.service';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { formatDate } from '../common/utils/format';

/** Format YYYY-MM-DD from local calendar date */
const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface EmployeeSummary {
  emp: any;
  ngayCong: number;        // distinct working days checked-in
  totalHours: number;      // sum of working hours across all sessions
  totalSessions: number;   // count of individual sessions
  annual: number;
  sick: number;
  comp: number;
  unpaid: number;
  holiday: number;
  unexcused: number;
  total: number;           // ngayCong + annual + holiday + sick + comp
}

@Injectable()
export class AttendanceExportSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: AttendanceQueryService,
  ) {}

  async exportSummaryReport(
    dto: ReportAttendanceDto,
    user: { id: number; role: string },
    res: Response,
  ) {
    const start = dto.dateFrom
      ? new Date(dto.dateFrom)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = dto.dateTo ? new Date(dto.dateTo) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // ── Calendar: official working days + paid holidays ───────────────────────
    const calDays = await this.prisma.calendarDay.findMany({
      where: { date: { gte: start, lte: end } },
    });
    const calMap = new Map(calDays.map((d) => [localDateStr(new Date(d.date)), d]));
    let officialWorkingDays = 0;
    let officialHolidayDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = localDateStr(d);
      const cal = calMap.get(ds);
      const dow = d.getDay();
      if (!cal) {
        if (dow !== 0 && dow !== 6) officialWorkingDays++;
        continue;
      }
      if (cal.type === 'WORKING' || cal.type === 'COMPENSATION') officialWorkingDays++;
      else if (cal.type === 'HOLIDAY' && cal.isPaid) officialHolidayDays++;
    }

    // ── Attendance records ────────────────────────────────────────────────────
    const { data: records } = await this.queryService.getReport(
      { ...dto, page: 1, limit: 10000, isLate: undefined, isEarlyOut: undefined },
      user,
    );

    // ── Leave requests (approved) ─────────────────────────────────────────────
    const leaveReqs = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'approved',
        OR: [
          { fromDate: { gte: start, lte: end } },
          { toDate: { gte: start, lte: end } },
          { fromDate: { lte: start }, toDate: { gte: end } },
        ],
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            position: { select: { name: true } },
          },
        },
      },
    });

    // ── Build employee map ────────────────────────────────────────────────────
    const empMap = new Map<number, any>();
    records.forEach((r: any) => { if (r.employee) empMap.set(r.employee.id, r.employee); });
    leaveReqs.forEach((lr) => { if (lr.employee) empMap.set(lr.employee.id, lr.employee); });
    const employees = [...empMap.values()].sort((a, b) =>
      (a.code || '').localeCompare(b.code || ''),
    );

    // ── Per-employee aggregation ──────────────────────────────────────────────
    // attDaySet: empId_date → true  (distinct working days)
    // attHoursMap: empId → total working hours across ALL sessions
    // attSessionsMap: empId → count of sessions
    const attDaySet = new Map<string, boolean>();
    const attHoursMap = new Map<number, number>();
    const attSessionsMap = new Map<number, number>();

    records.forEach((r: any) => {
      if (r.checkinTime && !r.isOnLeave) {
        const dayKey = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
        attDaySet.set(dayKey, true);

        const h = r.workingHours ? Number(r.workingHours) : 0;
        attHoursMap.set(r.employeeId, (attHoursMap.get(r.employeeId) ?? 0) + h);
        attSessionsMap.set(r.employeeId, (attSessionsMap.get(r.employeeId) ?? 0) + 1);
      }
    });

    const summaries: EmployeeSummary[] = employees.map((emp) => {
      // Count distinct working-calendar days with attendance
      let ngayCong = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = localDateStr(d);
        const cal = calMap.get(ds);
        const dow = d.getDay();
        const isWorking = cal
          ? cal.type === 'WORKING' || cal.type === 'COMPENSATION'
          : dow !== 0 && dow !== 6;
        if (!isWorking) continue;
        if (attDaySet.get(`${emp.id}_${ds}`)) ngayCong++;
      }

      const totalHours = parseFloat((attHoursMap.get(emp.id) ?? 0).toFixed(2));
      const totalSessions = attSessionsMap.get(emp.id) ?? 0;

      const empLeaves = leaveReqs.filter((lr) => lr.employeeId === emp.id);
      const leaveDays = (type: string) =>
        empLeaves
          .filter((l) => l.type === type)
          .reduce((s, l) => s + Number(l.days || 0), 0);

      const annual = leaveDays('annual');
      const sick = leaveDays('sick');
      const comp = leaveDays('compensatory');
      const unpaid = leaveDays('unpaid');
      const accounted = ngayCong + annual + sick + comp + unpaid + officialHolidayDays;
      const unexcused = Math.max(0, officialWorkingDays - accounted);

      return {
        emp,
        ngayCong,
        totalHours,
        totalSessions,
        annual,
        holiday: officialHolidayDays,
        sick,
        comp,
        unpaid,
        unexcused,
        total: parseFloat((ngayCong + annual + officialHolidayDays + sick + comp).toFixed(1)),
      };
    });

    // ── Build Excel ───────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Báo Cáo Ngày Công');
    const thin = { style: 'thin' as const };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    const COLS = [
      { h: 'STT', w: 5 },
      { h: 'Họ và tên', w: 22 },
      { h: 'Chức vụ', w: 14 },
      { h: 'Ngày\ncông', w: 8 },
      { h: 'Giờ\ncông', w: 9 },
      { h: 'Ca\nlàm', w: 7 },
      { h: 'Nghỉ phép\nnăm', w: 10 },
      { h: 'Nghỉ\nốm', w: 8 },
      { h: 'Nghỉ\nbù', w: 8 },
      { h: 'Nghỉ không\nlương', w: 11 },
      { h: 'Nghỉ\nlễ, Tết', w: 9 },
      { h: 'Nghỉ không\nlý do', w: 11 },
      { h: 'Cộng ngày\ncông hưởng', w: 12 },
    ];
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

    // Data rows
    // Columns: STT | Name | Position | ngayCong | totalHours | totalSessions | annual | sick | comp | unpaid | holiday | unexcused | total
    summaries.forEach((s, idx) => {
      const row = ws.getRow(4 + idx);
      row.height = 16;
      const vals = [
        idx + 1,
        s.emp.fullName || '',
        s.emp.position?.name || '',
        s.ngayCong,
        s.totalHours,
        s.totalSessions,
        s.annual,
        s.sick,
        s.comp,
        s.unpaid,
        s.holiday,
        s.unexcused,
        s.total,
      ];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = typeof v === 'number' ? (v === 0 ? 0 : parseFloat(v.toFixed(2))) : v;
        cell.border = border;
        // Red bold for unexcused absences (column index 11)
        cell.font = {
          size: 9,
          ...(ci === 11 && (v as number) > 0 ? { bold: true, color: { argb: 'FFCC0000' } } : {}),
          ...(typeof v === 'number' && v === 0 ? { color: { argb: 'FFAAAAAA' } } : {}),
        };
        cell.alignment = {
          horizontal: ci < 3 ? (ci === 0 ? 'center' : 'left') : 'center',
          vertical: 'middle',
        };
        // Highlight total column (last)
        if (ci === 12) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEFF1' } };
        // Highlight hours column with light green if > 0
        if (ci === 4 && (v as number) > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        }
      });
    });

    // Totals row
    const totalsRowIdx = 4 + summaries.length;
    const tr = ws.getRow(totalsRowIdx);
    tr.height = 18;
    ws.mergeCells(totalsRowIdx, 1, totalsRowIdx, 3);
    const tl = tr.getCell(1);
    tl.value = 'TỔNG CỘNG';
    tl.border = border;
    tl.font = { bold: true, size: 9 };
    tl.alignment = { horizontal: 'center', vertical: 'middle' };
    tl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };

    // Sum columns: ngayCong(4), totalHours(5), totalSessions(6), annual(7), sick(8), comp(9), unpaid(10), holiday(11), unexcused(12), total(13)
    const sumFields: (keyof EmployeeSummary)[] = [
      'ngayCong', 'totalHours', 'totalSessions',
      'annual', 'sick', 'comp', 'unpaid', 'holiday', 'unexcused', 'total',
    ];
    sumFields.forEach((field, i) => {
      const cell = tr.getCell(4 + i);
      const sum = summaries.reduce((a, s) => a + (s[field] as number), 0);
      cell.value = parseFloat(sum.toFixed(2));
      cell.border = border;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
    });

    const fn = `Bao_Cao_Ngay_Cong_T${String(start.getMonth() + 1).padStart(2, '0')}_${start.getFullYear()}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=${fn}`);
    await wb.xlsx.write(res);
    res.end();
  }
}
