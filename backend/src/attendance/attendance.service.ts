import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginate, buildPaginatedResponse } from '../common/dto/pagination.dto';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { ShiftService, hhmmToMinutes } from './shift.service';
import { LocationService, haversineMetres } from './location.service';
import { CalendarService } from '../calendar/calendar.service';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { formatDate, formatDateTime } from '../common/utils/format';

const ATTENDANCE_EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  email: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  office: { select: { id: true, name: true } },
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftService: ShiftService,
    private readonly locationService: LocationService,
    private readonly calendarService: CalendarService,
  ) {}

  // ─── Manual check-in / check-out ─────────────────────────────────────────

  async checkInOut(employeeId: number, type: 'check_in' | 'check_out', timestamp?: string) {
    const ts = timestamp ? new Date(timestamp) : new Date();
    const dateOnly = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));

    let attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, date: dateOnly },
    });

    if (type === 'check_in') {
      if (attendance?.checkinTime) {
        throw new BadRequestException('Already checked in today');
      }
      if (!attendance) {
        attendance = await this.prisma.attendance.create({
          data: { employeeId, date: dateOnly, checkinTime: ts },
        });
      } else {
        attendance = await this.prisma.attendance.update({
          where: { id: attendance.id },
          data: { checkinTime: ts },
        });
      }
    } else {
      if (!attendance?.checkinTime) {
        throw new BadRequestException('Must check in before checking out');
      }
      if (attendance.checkoutTime) {
        throw new BadRequestException('Already checked out today');
      }

      const diffMs = ts.getTime() - attendance.checkinTime.getTime();
      const workingHours = parseFloat((diffMs / 1000 / 60 / 60).toFixed(2));

      attendance = await this.prisma.attendance.update({
        where: { id: attendance.id },
        data: { checkoutTime: ts, workingHours },
      });
    }

    return attendance;
  }

  // ─── Raw import ───────────────────────────────────────────────────────────

  /**
   * Bulk-save raw timestamps from an access device.
   * Validates employee codes, inserts into AttendanceRaw, and returns the
   * distinct dates so the caller can immediately trigger processing.
   */
  async importRaw(dto: ImportAttendanceDto): Promise<{
    imported: number;
    unknownCodes: string[];
    dates: Date[];
  }> {
    const codes = [...new Set(dto.records.map((r) => r.employeeCode))];

    const employees = await this.prisma.employee.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });

    const knownCodes = new Set(employees.map((e) => e.code as string));
    const unknownCodes = codes.filter((c) => !knownCodes.has(c));

    const validRecords = dto.records.filter((r) => knownCodes.has(r.employeeCode));

    if (validRecords.length === 0) {
      throw new BadRequestException(
        `No valid records to import. Unknown employee codes: ${unknownCodes.join(', ')}`,
      );
    }

    await this.prisma.attendanceRaw.createMany({
      data: validRecords.map((r) => ({
        employeeCode: r.employeeCode,
        timestamp: new Date(r.timestamp),
      })),
    });

    const dateSet = new Set(
      validRecords.map((r) => {
        const ts = new Date(r.timestamp);
        return Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate());
      }),
    );
    const dates = [...dateSet].map((t) => new Date(t));

    return { imported: validRecords.length, unknownCodes, dates };
  }

  // ─── Report ───────────────────────────────────────────────────────────────

  async getReport(dto: ReportAttendanceDto, user: { id: number; role: string }) {
    const {
      page = 1,
      limit = 20,
      employeeId,
      departmentId,
      dateFrom,
      dateTo,
      q,
      employeeName,
      employeeCode,
      isLate,
      isEarlyOut,
      isOvertime,
    } = dto;
    const { skip, take } = paginate(page, limit);

    const where: any = { AND: [] };

    // 1. RBAC Scoping
    if (user.role === 'manager') {
      where.AND.push({
        OR: [{ employeeId: user.id }, { employee: { managerId: user.id } }],
      });
    } else if (user.role === 'employee') {
      where.AND.push({ employeeId: user.id });
    }

    // 2. Specific filters
    if (employeeId) where.AND.push({ employeeId });
    if (departmentId) where.AND.push({ employee: { departmentId } });

    if (dateFrom || dateTo) {
      const dateFilter: any = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.AND.push({ date: dateFilter });
    }

    // 3. Search / Column filters
    if (q) {
      where.AND.push({
        OR: [
          { employee: { fullName: { contains: q, mode: 'insensitive' } } },
          { employee: { code: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (employeeName) {
      where.AND.push({ employee: { fullName: { contains: employeeName, mode: 'insensitive' } } });
    }
    if (employeeCode) {
      where.AND.push({ employee: { code: { contains: employeeCode, mode: 'insensitive' } } });
    }

    if (isLate !== undefined) where.AND.push({ isLate });
    if (isEarlyOut !== undefined) where.AND.push({ isEarlyOut });
    if (isOvertime !== undefined) where.AND.push({ isOvertime });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: { 
          employee: { select: ATTENDANCE_EMPLOYEE_SELECT },
          shift: true
        },
        skip,
        take,
        orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
      }),
      this.prisma.attendance.count({ where }),
    ]);

    const totalWorkingHours = data.reduce(
      (sum, r) => sum + (r.workingHours ? Number(r.workingHours) : 0),
      0,
    );

    return {
      ...buildPaginatedResponse(data, total, page, limit),
      summary: {
        totalRecords: total,
        totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
      },
    };
  }

  async exportReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    // 1. Get ALL data (no pagination)
    const { data } = await this.getReport({ ...dto, page: 1, limit: 10000 }, user);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    worksheet.columns = [
      { header: 'Employee Code', key: 'code', width: 15 },
      { header: 'Full Name', key: 'name', width: 25 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Check-in', key: 'checkin', width: 20 },
      { header: 'Check-out', key: 'checkout', width: 20 },
      { header: 'Working Hours', key: 'hours', width: 15 },
      { header: 'Status', key: 'status', width: 25 },
      { header: 'In Note', key: 'inNote', width: 25 },
      { header: 'Out Note', key: 'outNote', width: 25 },
    ];

    data.forEach((r: any) => {
      const statusArr: string[] = [];
      if (r.isLate) statusArr.push('Late');
      if (r.isEarlyOut) statusArr.push('Early Out');
      if (r.isOvertime) statusArr.push('Overtime');
      if (statusArr.length === 0 && r.checkinTime) statusArr.push('Normal');

      worksheet.addRow({
        code: r.employee?.code,
        name: r.employee?.fullName,
        date: formatDate(r.date),
        checkin: r.checkinTime ? formatDateTime(r.checkinTime) : '-',
        checkout: r.checkoutTime ? formatDateTime(r.checkoutTime) : '-',
        hours: r.workingHours ? Number(r.workingHours).toFixed(2) : '0.00',
        status: statusArr.join(', '),
        inNote: r.checkinNote || '-',
        outNote: r.checkoutNote || '-',
      });
    });

    // Formatting
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + `Attendance_Report_${formatDate(new Date())}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  async exportGridReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    const start = dto.dateFrom ? new Date(dto.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = dto.dateTo ? new Date(dto.dateTo) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // Build ordered day list
    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));

    // Fetch all records (skip late/earlyOut filters for grid)
    const { data: records } = await this.getReport(
      { ...dto, page: 1, limit: 10000, isLate: undefined, isEarlyOut: undefined, isOvertime: undefined },
      user,
    );

    // Unique employees sorted by code
    const empMap = new Map<number, any>();
    records.forEach((r: any) => { if (r.employee && !empMap.has(r.employee.id)) empMap.set(r.employee.id, r.employee); });
    const employees = [...empMap.values()].sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    // Lookup: `${empId}_${dateISO}` → record
    const lookup = new Map<string, any>();
    records.forEach((r: any) => { lookup.set(`${r.employeeId}_${new Date(r.date).toISOString().split('T')[0]}`, r); });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bảng Chấm Công');

    const FIX = 3; // STT | Họ và tên | Chức vụ
    const thin = { style: 'thin' as const };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const sunFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFC7CE' } };
    const leaveFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } };

    const applyCell = (cell: ExcelJS.Cell, val: any, opts: Partial<ExcelJS.Style> & { value?: any } = {}) => {
      cell.value = val;
      cell.border = opts.border ?? border;
      cell.alignment = opts.alignment ?? { horizontal: 'center', vertical: 'middle' };
      if (opts.font) cell.font = opts.font;
      if (opts.fill) cell.fill = opts.fill;
    };

    // Fixed column widths
    ws.getColumn(1).width = 5; ws.getColumn(2).width = 22; ws.getColumn(3).width = 14;

    // ── Header rows 1-3 ───────────────────────────────────────────────────────
    [1, 2, 3].forEach(r => { ws.getRow(r).height = 18; });
    // Fixed columns span rows 1-3
    ['STT', 'HỌ VÀ TÊN', 'Chức vụ'].forEach((label, ci) => {
      ws.mergeCells(1, ci + 1, 3, ci + 1);
      applyCell(ws.getCell(1, ci + 1), label, { font: { bold: true, size: 9 } });
    });

    days.forEach((day, i) => {
      const colS = FIX + 1 + i * 2;
      const dow = day.getDay(); // 0=Sun
      const isSun = dow === 0;
      const dowLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow];
      const sunFont = { bold: true, size: 9, color: { argb: 'FFCC0000' } };
      const normFont = { bold: true, size: 9 };

      // Row 1: day-of-week (merged S+C)
      ws.mergeCells(1, colS, 1, colS + 1);
      applyCell(ws.getCell(1, colS), dowLabel, { font: isSun ? sunFont : normFont, ...(isSun && { fill: sunFill }) });

      // Row 2: date number (merged S+C)
      ws.mergeCells(2, colS, 2, colS + 1);
      applyCell(ws.getCell(2, colS), String(day.getDate()).padStart(2, '0'), {
        font: isSun ? sunFont : normFont, ...(isSun && { fill: sunFill }),
      });

      // Row 3: S / C headers
      ['S', 'C'].forEach((sc, si) => {
        const col = colS + si;
        ws.getColumn(col).width = 4;
        applyCell(ws.getCell(3, col), sc, { font: isSun ? sunFont : normFont, ...(isSun && { fill: sunFill }) });
      });
    });

    // ── Data rows ─────────────────────────────────────────────────────────────
    employees.forEach((emp, idx) => {
      const row = ws.getRow(4 + idx);
      row.height = 16;
      [emp.code ? idx + 1 : idx + 1, emp.fullName || '', emp.position?.name || ''].forEach((v, ci) => {
        applyCell(row.getCell(ci + 1), v, { alignment: { horizontal: ci === 0 ? 'center' : 'left', vertical: 'middle' }, font: { size: 9 } });
      });

      days.forEach((day, di) => {
        const ds = day.toISOString().split('T')[0];
        const rec = lookup.get(`${emp.id}_${ds}`);
        const colS = FIX + 1 + di * 2;
        const isSun = day.getDay() === 0;

        let sVal = '', cVal = '', isLeave = false;
        if (rec) {
          if (rec.isOnLeave) { sVal = 'P'; cVal = 'P'; isLeave = true; }
          else { if (rec.checkinTime) sVal = '/'; if (rec.checkoutTime) cVal = '/'; }
        }

        [sVal, cVal].forEach((v, si) => {
          const cell = row.getCell(colS + si);
          applyCell(cell, v, {
            font: isLeave ? { bold: true, size: 9, color: { argb: 'FFCC6600' } } : { size: 9 },
            ...(isLeave ? { fill: leaveFill } : isSun ? { fill: sunFill } : {}),
          });
        });
      });
    });

    const filename = `Bang_Cham_Cong_${start.getFullYear()}_${String(start.getMonth() + 1).padStart(2, '0')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    await wb.xlsx.write(res);
    res.end();
  }

  async exportSummaryReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    const start = dto.dateFrom ? new Date(dto.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = dto.dateTo ? new Date(dto.dateTo) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // 1. Calendar days in range → working days + holiday days count
    const calDays = await this.prisma.calendarDay.findMany({ where: { date: { gte: start, lte: end } } });
    const calMap = new Map(calDays.map(d => [d.date.toISOString().split('T')[0], d]));
    let officialWorkingDays = 0; let officialHolidayDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const cal = calMap.get(ds);
      const dow = d.getDay();
      if (!cal) { if (dow !== 0 && dow !== 6) officialWorkingDays++; continue; }
      if (cal.type === 'WORKING' || cal.type === 'COMPENSATION') officialWorkingDays++;
      else if (cal.type === 'HOLIDAY' && cal.isPaid) officialHolidayDays++;
    }

    // 2. All attendance records (no filters)
    const { data: records } = await this.getReport({ ...dto, page: 1, limit: 10000, isLate: undefined, isEarlyOut: undefined }, user);

    // 3. Approved leave requests overlapping range
    const leaveReqs = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'approved',
        OR: [
          { fromDate: { gte: start, lte: end } },
          { toDate: { gte: start, lte: end } },
          { fromDate: { lte: start }, toDate: { gte: end } },
        ],
      },
      include: { employee: { select: { id: true, code: true, fullName: true, position: { select: { name: true } } } } },
    });

    // 4. Build employee map
    const empMap = new Map<number, any>();
    records.forEach((r: any) => { if (r.employee) empMap.set(r.employee.id, r.employee); });
    leaveReqs.forEach(lr => { if (lr.employee) empMap.set(lr.employee.id, lr.employee); });
    const employees = [...empMap.values()].sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    // 5. Attendance lookup: empId_date → record
    const attMap = new Map<string, any>();
    records.forEach((r: any) => { attMap.set(`${r.employeeId}_${new Date(r.date).toISOString().split('T')[0]}`, r); });

    // 6. Per-employee summary
    const summaries = employees.map(emp => {
      let ngayCong = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0]; const cal = calMap.get(ds); const dow = d.getDay();
        const isWorking = cal ? (cal.type === 'WORKING' || cal.type === 'COMPENSATION') : (dow !== 0 && dow !== 6);
        if (!isWorking) continue;
        const rec = attMap.get(`${emp.id}_${ds}`);
        if (rec?.checkinTime && !rec.isOnLeave) ngayCong++;
      }
      const empLeaves = leaveReqs.filter(lr => lr.employeeId === emp.id);
      const leaveDays = (type: string) => empLeaves.filter(l => l.type === type).reduce((s, l) => s + Number(l.days || 0), 0);
      const annual = leaveDays('annual'); const sick = leaveDays('sick');
      const comp = leaveDays('compensatory'); const unpaid = leaveDays('unpaid');
      const accounted = ngayCong + annual + sick + comp + unpaid + officialHolidayDays;
      const unexcused = Math.max(0, officialWorkingDays - accounted);
      return { emp, ngayCong, annual, holiday: officialHolidayDays, sick, comp, unpaid, unexcused,
        total: parseFloat((ngayCong + annual + officialHolidayDays + sick + comp).toFixed(1)) };
    });

    // 7. Excel
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Báo Cáo Ngày Công');
    const thin = { style: 'thin' as const }; const border = { top: thin, left: thin, bottom: thin, right: thin };
    const COLS = [
      { h: 'STT', w: 5 }, { h: 'Họ và tên', w: 22 }, { h: 'Chức vụ', w: 14 },
      { h: 'Ngày\ncông', w: 8 },
      { h: 'Nghỉ phép\nnăm', w: 10 }, { h: 'Nghỉ\nốm', w: 8 },
      { h: 'Nghỉ\nbù', w: 8 }, { h: 'Nghỉ không\nlương', w: 11 },
      { h: 'Nghỉ\nlễ, Tết', w: 9 },
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

    // Sub-title
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
      cell.value = c.h; cell.border = border;
      cell.font = { bold: true, size: 9 }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBC8F5' } };
    });

    // Data rows
    summaries.forEach((s, idx) => {
      const row = ws.getRow(4 + idx); row.height = 16;
      const vals = [idx+1, s.emp.fullName||'', s.emp.position?.name||'',
        s.ngayCong, s.annual, s.sick, s.comp, s.unpaid, s.holiday, s.unexcused, s.total];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = typeof v === 'number' ? (v === 0 ? 0 : parseFloat(v.toFixed(1))) : v;
        cell.border = border;
        cell.font = { size: 9, ...(ci===9 && (v as number)>0 ? { bold: true, color: { argb: 'FFCC0000' } } : {}),
                                 ...(typeof v === 'number' && v===0 ? { color: { argb: 'FFAAAAAA' } } : {}) };
        cell.alignment = { horizontal: ci < 3 ? (ci===0 ? 'center' : 'left') : 'center', vertical: 'middle' };
        if (ci === 10) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEFF1' } };
      });
    });

    // Total row
    const tr = ws.getRow(4 + summaries.length); tr.height = 18;
    ws.mergeCells(4+summaries.length, 1, 4+summaries.length, 3);
    const tl = tr.getCell(1);
    tl.value = 'TỔNG CỘNG'; tl.border = border;
    tl.font = { bold: true, size: 9 }; tl.alignment = { horizontal: 'center', vertical: 'middle' };
    tl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
    [3,4,5,6,7,8,9,10].forEach((ci, i) => {
      const cell = tr.getCell(ci+1);
      const field = (['ngayCong','annual','sick','comp','unpaid','holiday','unexcused','total'] as const)[i];
      cell.value = parseFloat(summaries.reduce((a,s)=>a+s[field],0).toFixed(1));
      cell.border = border; cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
    });

    const fn = `Bao_Cao_Ngay_Cong_T${String(start.getMonth()+1).padStart(2,'0')}_${start.getFullYear()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fn}`);
    await wb.xlsx.write(res); res.end();
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async findAll(query: PaginationDto & { employeeId?: number; date?: string }) {
    const { page = 1, limit = 20, employeeId, date } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (date) where.date = new Date(date);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: { employee: { select: ATTENDANCE_EMPLOYEE_SELECT } },
        skip,
        take,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findTodayStatus(employeeId: number) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayStr = today.toISOString().split('T')[0];

    const [attendance, dayInfo] = await Promise.all([
      this.prisma.attendance.findFirst({
        where: { employeeId, date: today },
        include: { shift: true },
      }),
      this.calendarService.checkDay(todayStr),
    ]);

    return {
      date: today,
      attendance: attendance ?? null,
      checkedIn: !!attendance?.checkinTime,
      checkedOut: !!attendance?.checkoutTime,
      dayInfo,
    };
  }

  async getSummary(employeeId: number, month: number, year: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));

    const records = await this.prisma.attendance.findMany({
      where: { employeeId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    const totalWorkingHours = records.reduce(
      (acc, r) => acc + (r.workingHours ? Number(r.workingHours) : 0),
      0,
    );

    return {
      employeeId,
      month,
      year,
      totalDays: records.length,
      totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
      records,
    };
  }

  // ─── WFM: Check-in ────────────────────────────────────────────────────────

  async checkIn(employeeId: number, dto: CheckInDto) {
    const ts = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const dateOnly = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));
    const dateStr = dateOnly.toISOString().split('T')[0];

    // 1. Core context
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        shiftId: true,
        workingMode: true,
        office: { select: { latitude: true, longitude: true, radius: true, name: true } },
      },
    });

    // 2. Prevent double check-in
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: dateOnly } },
    });
    if (existing?.checkinTime) {
      throw new BadRequestException('Already checked in today');
    }

    // 3. Office GPS validation
    const hasGps = dto.lat != null && dto.lng != null;
    let officeDistanceM: number | undefined;
    let isInOffice = false;
    let officeStatus: 'IN_OFFICE' | 'OUTSIDE' | null = null;

    if (hasGps && emp?.office) {
      const { latitude, longitude, radius } = emp.office;
      const dist = haversineMetres(dto.lat!, dto.lng!, latitude, longitude);
      officeDistanceM = Math.round(dist);
      isInOffice = dist <= radius;
      officeStatus = isInOffice ? 'IN_OFFICE' : 'OUTSIDE';
    }

    // 4. Geofence validation (WorkLocation table)
    let isWithinGeofence = false;
    let nearestLoc: { name: string; distanceM: number; id: number } | undefined;

    if (hasGps) {
      const nearest = await this.locationService.findNearest(dto.lat!, dto.lng!);
      if (nearest) {
        isWithinGeofence = nearest.withinRadius;
        nearestLoc = { name: nearest.name, distanceM: nearest.distanceM, id: nearest.locationId };
      }
    }

    // 4b. Branch geofence validation — must run BEFORE the location guard so
    //     users inside a branch radius are not incorrectly forced to provide a reason.
    let isWithinBranch = false;
    let nearestBranch: { id: number; name: string; distanceM: number; isInOffice: boolean } | null = null;

    if (hasGps) {
      const branches = await this.prisma.branch.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { id: true, name: true, latitude: true, longitude: true, radius: true },
      });
      for (const branch of branches) {
        if (branch.latitude == null || branch.longitude == null) continue;
        const dist = Math.round(haversineMetres(dto.lat!, dto.lng!, branch.latitude, branch.longitude));
        if (!nearestBranch || dist < nearestBranch.distanceM) {
          nearestBranch = {
            id: branch.id,
            name: branch.name ?? 'Unknown',
            distanceM: dist,
            isInOffice: dist <= (branch.radius ?? 50),
          };
        }
      }
      isWithinBranch = nearestBranch?.isInOffice ?? false;
    }

    // 5. Location guard: MUST be in assigned office OR any WorkLocation OR any Branch OR provide a reason
    const locationNote = dto.locationNote?.trim();
    if (!isInOffice && !isWithinGeofence && !isWithinBranch && !locationNote) {
      if (!hasGps) {
        throw new BadRequestException('GPS location is required or provide a reason (Working from client, etc.)');
      }
      const officeName = emp?.office?.name || 'an authorized office';
      throw new BadRequestException(`You are outside "${officeName}". Please provide a reason to clock in.`);
    }

    // 5b. Merge branch/geofence authorization into isInOffice.
    // When the guard passes via a branch or geofence (not the assigned office),
    // mark the record as IN_OFFICE so reports and the UI show the correct status.
    if (!isInOffice && (isWithinBranch || isWithinGeofence)) {
      isInOffice = true;
      // If the assigned-office check returned OUTSIDE, upgrade it — the employee
      // is still in an authorized location even if not in their specific office.
      if (officeStatus === 'OUTSIDE') officeStatus = 'IN_OFFICE';
    }

    let resolvedLocationId = nearestLoc?.id;
    let distanceM = nearestLoc?.distanceM;

    const dayInfo = await this.calendarService.checkDay(dateStr);

    // 6. Resolve shift
    let shift: Awaited<ReturnType<ShiftService['detectShift']>> = null;
    if (emp?.shiftId) {
      shift = await this.prisma.shift.findUnique({ where: { id: emp.shiftId } }) ?? null;
    } else if (!emp?.workingMode || emp.workingMode === 'FIXED') {
      shift = await this.shiftService.findDefault();
    } else {
      shift = await this.shiftService.detectShift(ts);
    }
    const shiftId = shift?.id ?? undefined;

    // 7. Determine late
    let isLate = false;
    if (shift) {
      const checkinMin = ts.getHours() * 60 + ts.getMinutes();
      const startMin   = hhmmToMinutes(shift.startTime);
      const normalMin  = shift.isCrossDay && checkinMin < startMin ? checkinMin + 1440 : checkinMin;
      isLate = normalMin > startMin + shift.graceLateMinutes;
    }

    // 8. Upsert attendance row
    const attendance = existing
      ? await this.prisma.attendance.update({
          where: { id: existing.id },
          data: {
            checkinTime: ts,
            shiftId,
            isLate,
            checkinLat: dto.lat,
            checkinLng: dto.lng,
            officeDistanceM,
            isInOffice,
            hasLocation: hasGps,
            checkinNote: locationNote,
            locationNote, // for backward compatibility
          },
        })
      : await this.prisma.attendance.create({
          data: {
            employeeId,
            date: dateOnly,
            checkinTime: ts,
            shiftId,
            isLate,
            checkinLat: dto.lat,
            checkinLng: dto.lng,
            officeDistanceM,
            isInOffice,
            hasLocation: hasGps,
            checkinNote: locationNote,
            locationNote, // for backward compatibility
          },
        });

    // 9. Write audit log entry
    await this.prisma.attendanceLog.create({
      data: {
        employeeId,
        time: ts,
        type: 'check_in',
        lat: dto.lat,
        lng: dto.lng,
        locationId: resolvedLocationId,
        deviceId: dto.deviceId,
        distanceM,
        note: locationNote,
        attendanceId: attendance.id,
      },
    });

    // 10. nearestBranch is already computed in step 4b (moved up for location guard).

    return {
      attendance,
      isLate,
      dayInfo,
      shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
      location: resolvedLocationId ? { id: resolvedLocationId, distanceM } : null,
      office: officeStatus !== null ? { status: officeStatus, distanceM: officeDistanceM } : null,
      locationSource: hasGps ? 'GPS' : 'NO_LOCATION',
      nearestBranch,
    };
  }

  // ─── WFM: Check-out ───────────────────────────────────────────────────────

  async checkOut(employeeId: number, dto: CheckOutDto) {
    const ts = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const dateOnly = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));

    const attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, date: dateOnly },
      include: { shift: true },
    });

    if (!attendance?.checkinTime) {
      throw new BadRequestException('Must check in before checking out');
    }
    if (attendance.checkoutTime) {
      throw new BadRequestException('Already checked out today');
    }

    // 1. Office GPS validation
    const hasGps = dto.lat != null && dto.lng != null;
    let isInOffice = false;
    let officeName = 'office';

    if (hasGps) {
      const emp = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { office: { select: { latitude: true, longitude: true, radius: true, name: true } } },
      });
      if (emp?.office) {
        officeName = emp.office.name;
        const dist = haversineMetres(dto.lat!, dto.lng!, emp.office.latitude, emp.office.longitude);
        isInOffice = dist <= emp.office.radius;
      }
    }

    // 2. Geofence validation (WorkLocation table)
    let isWithinGeofence = false;
    let nearestLoc: { name: string; distanceM: number; id: number } | undefined;

    if (hasGps) {
      const nearest = await this.locationService.findNearest(dto.lat!, dto.lng!);
      if (nearest) {
        isWithinGeofence = nearest.withinRadius;
        nearestLoc = { name: nearest.name, distanceM: nearest.distanceM, id: nearest.locationId };
      }
    }

    // 2b. Branch geofence validation — must run BEFORE the location guard.
    let isWithinBranch = false;
    if (hasGps) {
      const branches = await this.prisma.branch.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { id: true, latitude: true, longitude: true, radius: true },
      });
      for (const branch of branches) {
        if (branch.latitude == null || branch.longitude == null) continue;
        const dist = haversineMetres(dto.lat!, dto.lng!, branch.latitude, branch.longitude);
        if (dist <= (branch.radius ?? 50)) {
          isWithinBranch = true;
          break;
        }
      }
    }

    // 3. Location guard: assigned office OR WorkLocation OR Branch OR reason
    const locationNote = dto.locationNote?.trim();
    if (!isInOffice && !isWithinGeofence && !isWithinBranch && !locationNote) {
      throw new BadRequestException(`You are outside "${officeName}". Please provide a reason to clock out.`);
    }

    let resolvedLocationId = nearestLoc?.id;
    let distanceM = nearestLoc?.distanceM;

    // Calculate working hours
    const diffMs = ts.getTime() - attendance.checkinTime.getTime();
    const workingHours = parseFloat((diffMs / 1000 / 3600).toFixed(2));

    // WFM status flags (cross-day aware)
    let isEarlyOut = false;
    let isOvertime = false;
    let overtimeHours: number | undefined;

    if (attendance.shift) {
      const s = attendance.shift;
      const startMin = hhmmToMinutes(s.startTime);
      let endMin = hhmmToMinutes(s.endTime);
      // Normalize end time for cross-day shifts
      if (s.isCrossDay && endMin <= startMin) endMin += 1440;

      const normalHours = (endMin - startMin - s.breakMinutes) / 60;
      const graceEarlyH  = s.graceEarlyMinutes / 60;

      isEarlyOut = workingHours < normalHours - graceEarlyH;
      isOvertime = workingHours > normalHours;
      if (isOvertime) {
        overtimeHours = parseFloat((workingHours - normalHours).toFixed(2));
      }
    }

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkoutTime: ts,
        workingHours,
        isEarlyOut,
        isOvertime,
        overtimeHours,
        checkoutLat: dto.lat,
        checkoutLng: dto.lng,
        checkoutNote: locationNote,
      },
    });

    await this.prisma.attendanceLog.create({
      data: {
        employeeId,
        time: ts,
        type: 'check_out',
        lat: dto.lat,
        lng: dto.lng,
        locationId: resolvedLocationId,
        deviceId: dto.deviceId,
        distanceM,
        note: locationNote,
        attendanceId: attendance.id,
      },
    });

    return {
      attendance: updated,
      workingHours,
      isEarlyOut,
      isOvertime,
      overtimeHours: overtimeHours ?? 0,
    };
  }

  // ─── WFM: My records ──────────────────────────────────────────────────────

  async getMyRecords(
    employeeId: number,
    query: PaginationDto & { dateFrom?: string; dateTo?: string },
  ) {
    const { page = 1, limit = 20, dateFrom, dateTo } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = { employeeId };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: { shift: true },
        skip,
        take,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }
}
