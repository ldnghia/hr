/**
 * AttendanceExportGridService — Excel grid export (employee × day matrix).
 *
 * Grid cell shows S/C (Sáng/Chiều) check marks for each day.
 * For multi-shift days: workingHours = SUM across all sessions that day.
 * Earliest check-in / latest checkout are used for display.
 * Also adds a "Báo Cáo Ngày Công" summary sheet for ca cố định.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceQueryService } from './attendance-query.service';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { buildFixedSummarySheet } from './attendance-export-fixed-summary-sheet';

/** Format YYYY-MM-DD from local calendar date (avoids UTC shift on UTC+7 servers) */
const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Aggregated day slot for grid lookup */
interface DaySlot {
  checkinTime: Date | null;
  checkoutTime: Date | null;
  isOnLeave: boolean;
  totalWorkingHours: number;
  sessionsCount: number;
}

@Injectable()
export class AttendanceExportGridService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: AttendanceQueryService,
  ) {}

  async exportGridReport(
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

    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    const { data: records } = await this.queryService.getReport(
      {
        ...dto,
        page: 1,
        limit: 10000,
        isLate: undefined,
        isEarlyOut: undefined,
        isOvertime: undefined,
      },
      user,
    );

    // Build employee list (preserve order by code)
    const empMap = new Map<number, any>();
    records.forEach((r: any) => {
      if (r.employee && !empMap.has(r.employee.id)) empMap.set(r.employee.id, r.employee);
    });
    const employees = [...empMap.values()].sort((a, b) =>
      (a.code || '').localeCompare(b.code || ''),
    );

    // Aggregate all sessions per (employeeId, date) → DaySlot
    const lookup = new Map<string, DaySlot>();
    records.forEach((r: any) => {
      const key = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
      const existing = lookup.get(key);
      const rHours = r.workingHours ? Number(r.workingHours) : 0;

      if (!existing) {
        lookup.set(key, {
          checkinTime: r.checkinTime ? new Date(r.checkinTime) : null,
          checkoutTime: r.checkoutTime ? new Date(r.checkoutTime) : null,
          isOnLeave: !!r.isOnLeave,
          totalWorkingHours: rHours,
          sessionsCount: 1,
        });
      } else {
        // Earliest check-in across sessions
        if (r.checkinTime) {
          const t = new Date(r.checkinTime);
          if (!existing.checkinTime || t < existing.checkinTime) existing.checkinTime = t;
        }
        // Latest checkout across sessions
        if (r.checkoutTime) {
          const t = new Date(r.checkoutTime);
          if (!existing.checkoutTime || t > existing.checkoutTime) existing.checkoutTime = t;
        }
        existing.isOnLeave = existing.isOnLeave || !!r.isOnLeave;
        // Sum working hours across all sessions (key fix for multi-shift)
        existing.totalWorkingHours += rHours;
        existing.sessionsCount += 1;
      }
    });

    // ── Build Excel workbook ──────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bảng Chấm Công');

    const FIX = 3; // fixed columns: STT, HỌ VÀ TÊN, Chức vụ
    const thin = { style: 'thin' as const };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const sunFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFC7CE' } };
    const leaveFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } };

    const applyCell = (
      cell: ExcelJS.Cell,
      val: any,
      opts: Partial<ExcelJS.Style> & { value?: any } = {},
    ) => {
      cell.value = val;
      cell.border = opts.border ?? border;
      cell.alignment = opts.alignment ?? { horizontal: 'center', vertical: 'middle' };
      if (opts.font) cell.font = opts.font;
      if (opts.fill) cell.fill = opts.fill;
    };

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 22;
    ws.getColumn(3).width = 14;
    [1, 2, 3].forEach((r) => { ws.getRow(r).height = 18; });

    // Header row 1–3: fixed columns
    ['STT', 'HỌ VÀ TÊN', 'Chức vụ'].forEach((label, ci) => {
      ws.mergeCells(1, ci + 1, 3, ci + 1);
      applyCell(ws.getCell(1, ci + 1), label, { font: { bold: true, size: 9 } });
    });

    // Day columns: 2 sub-columns each (S / C)
    days.forEach((day, i) => {
      const colS = FIX + 1 + i * 2;
      const dow = day.getDay();
      const isSun = dow === 0;
      const dowLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow];
      const sunFont = { bold: true, size: 9, color: { argb: 'FFCC0000' } };
      const normFont = { bold: true, size: 9 };

      ws.mergeCells(1, colS, 1, colS + 1);
      applyCell(ws.getCell(1, colS), dowLabel, {
        font: isSun ? sunFont : normFont,
        ...(isSun && { fill: sunFill }),
      });

      ws.mergeCells(2, colS, 2, colS + 1);
      applyCell(ws.getCell(2, colS), String(day.getDate()).padStart(2, '0'), {
        font: isSun ? sunFont : normFont,
        ...(isSun && { fill: sunFill }),
      });

      ['S', 'C'].forEach((sc, si) => {
        const col = colS + si;
        ws.getColumn(col).width = 4;
        applyCell(ws.getCell(3, col), sc, {
          font: isSun ? sunFont : normFont,
          ...(isSun && { fill: sunFill }),
        });
      });
    });

    // Data rows
    employees.forEach((emp, idx) => {
      const row = ws.getRow(4 + idx);
      row.height = 16;

      [idx + 1, emp.fullName || '', emp.position?.name || ''].forEach((v, ci) => {
        applyCell(row.getCell(ci + 1), v, {
          alignment: { horizontal: ci === 0 ? 'center' : 'left', vertical: 'middle' },
          font: { size: 9 },
        });
      });

      days.forEach((day, di) => {
        const ds = localDateStr(day);
        const slot = lookup.get(`${emp.id}_${ds}`);
        const colS = FIX + 1 + di * 2;
        const isSun = day.getDay() === 0;

        let sVal = '', cVal = '', isLeave = false;
        if (slot) {
          if (slot.isOnLeave) {
            sVal = 'P'; cVal = 'P'; isLeave = true;
          } else {
            // S column: checkin present; C column: checkout present
            if (slot.checkinTime) sVal = '/';
            if (slot.checkoutTime) cVal = '/';
            // Multi-shift indicator: show session count if > 1
            if (slot.sessionsCount > 1 && slot.checkinTime) sVal = `/${slot.sessionsCount}`;
          }
        }

        [sVal, cVal].forEach((v, si) => {
          const cell = row.getCell(colS + si);
          applyCell(cell, v, {
            font: isLeave
              ? { bold: true, size: 9, color: { argb: 'FFCC6600' } }
              : { size: 9 },
            ...(isLeave ? { fill: leaveFill } : isSun ? { fill: sunFill } : {}),
          });
        });
      });
    });

    // ── "Báo Cáo Ngày Công" summary sheet ────────────────────────────────────
    const calDays = await this.prisma.calendarDay.findMany({
      where: { date: { gte: start, lte: end } },
    });
    const calMap = new Map(calDays.map((d) => [
      localDateStr(new Date(d.date)),
      { type: d.type },
    ]));

    let officialWorkingDays = 0;
    let officialHolidayDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = localDateStr(d);
      const cal = calMap.get(ds);
      const dow = d.getDay();
      if (!cal) { if (dow !== 0 && dow !== 6) officialWorkingDays++; continue; }
      if (cal.type === 'WORKING' || cal.type === 'COMPENSATION') officialWorkingDays++;
      else if (cal.type === 'HOLIDAY') officialHolidayDays++;
    }

    const leaveReqs = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'approved',
        OR: [
          { fromDate: { gte: start, lte: end } },
          { toDate: { gte: start, lte: end } },
          { fromDate: { lte: start }, toDate: { gte: end } },
        ],
      },
    });

    buildFixedSummarySheet(
      wb, records, leaveReqs, employees,
      start, end, officialWorkingDays, officialHolidayDays, calMap,
    );

    const filename = `Bang_Cham_Cong_${start.getFullYear()}_${String(start.getMonth() + 1).padStart(2, '0')}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    await wb.xlsx.write(res);
    res.end();
  }
}
