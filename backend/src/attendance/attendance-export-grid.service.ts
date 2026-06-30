/**
 * AttendanceExportGridService — Excel grid export (employee × day matrix).
 *
 * Grid cell shows S/C/T (Sáng/Chiều/Tối) check marks for each day.
 * Shift slot classification by shift.startTime:
 *   S (Sáng)   : startTime < "12:00"
 *   C (Chiều)  : "12:00" <= startTime < "18:00"
 *   T (Tối)    : startTime >= "18:00"
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

/** Per-shift-slot presence for one employee × day */
interface ShiftSlot { present: boolean; isLeave: boolean; isCorrected: boolean; }

/** Aggregated day slots: S / C / T per (employeeId, date) */
interface DaySlot {
  S: ShiftSlot;
  C: ShiftSlot;
  T: ShiftSlot;
  isOnLeave: boolean; // any slot is leave → whole day is leave
}

/** Classify shift to S/C/T by startTime (HH:MM string) */
function classifyShift(startTime: string | undefined | null): 'S' | 'C' | 'T' {
  if (!startTime) return 'S'; // fallback to morning
  const [h, m] = startTime.split(':').map(Number);
  const mins = h * 60 + (m || 0);
  if (mins < 12 * 60) return 'S';   // before 12:00 → Sáng
  if (mins < 18 * 60) return 'C';   // 12:00–17:59 → Chiều
  return 'T';                        // 18:00+ → Tối
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
    const now = new Date();
    const start = dto.dateFrom ? new Date(dto.dateFrom) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end   = dto.dateTo   ? new Date(dto.dateTo)   : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

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

    // Aggregate sessions per (employeeId, date) → DaySlot with S/C/T slots
    const emptySlot = (): ShiftSlot => ({ present: false, isLeave: false, isCorrected: false });
    const emptyDay = (): DaySlot => ({ S: emptySlot(), C: emptySlot(), T: emptySlot(), isOnLeave: false });

    const lookup = new Map<string, DaySlot>();
    records.forEach((r: any) => {
      const key = `${r.employeeId}_${localDateStr(new Date(r.date))}`;
      if (!lookup.has(key)) lookup.set(key, emptyDay());
      const day = lookup.get(key)!;

      const slot = classifyShift(r.shift?.startTime);
      if (r.isOnLeave) {
        day.S.isLeave = day.C.isLeave = day.T.isLeave = true;
        day.isOnLeave = true;
      } else if (r.checkinTime || r.checkoutTime) {
        day[slot].present = true;
      }
      if (r.isCorrected) day[slot].isCorrected = true;
    });

    // ── Build Excel workbook ──────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bảng Chấm Công');

    const FIX = 4; // fixed columns: STT, HỌ VÀ TÊN, Chức vụ, Phòng ban (matches grid header)
    const thin = { style: 'thin' as const };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const sunFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFC7CE' } };
    const leaveFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } };
    // light purple for corrected shifts
    const correctedFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8D0FF' } };

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
    ws.getColumn(4).width = 20;
    [1, 2, 3].forEach((r) => { ws.getRow(r).height = 18; });

    // Header row 1–3: fixed columns (STT / HỌ VÀ TÊN / Chức vụ / Phòng ban)
    ['STT', 'HỌ VÀ TÊN', 'Chức vụ', 'Phòng ban'].forEach((label, ci) => {
      ws.mergeCells(1, ci + 1, 3, ci + 1);
      applyCell(ws.getCell(1, ci + 1), label, { font: { bold: true, size: 9 } });
    });

    // Day columns: 3 sub-columns each (S / C / T)
    days.forEach((day, i) => {
      const colS = FIX + 1 + i * 3; // 3 sub-cols per day
      const dow = day.getDay();
      const isSun = dow === 0;
      const dowLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow];
      const sunFont = { bold: true, size: 9, color: { argb: 'FFCC0000' } };
      const normFont = { bold: true, size: 9 };

      // Row 1: day-of-week label spans 3 sub-cols
      ws.mergeCells(1, colS, 1, colS + 2);
      applyCell(ws.getCell(1, colS), dowLabel, {
        font: isSun ? sunFont : normFont,
        ...(isSun && { fill: sunFill }),
      });

      // Row 2: date number spans 3 sub-cols
      ws.mergeCells(2, colS, 2, colS + 2);
      applyCell(ws.getCell(2, colS), String(day.getDate()).padStart(2, '0'), {
        font: isSun ? sunFont : normFont,
        ...(isSun && { fill: sunFill }),
      });

      // Row 3: S / C / T labels
      ['S', 'C', 'T'].forEach((sc, si) => {
        const col = colS + si;
        ws.getColumn(col).width = 4;
        applyCell(ws.getCell(3, col), sc, {
          font: isSun ? sunFont : normFont,
          ...(isSun && { fill: sunFill }),
        });
      });
    });

    // Track per-column totals (column index → count of '/' marks)
    const colTotals = new Map<number, number>();

    // Data rows
    employees.forEach((emp, idx) => {
      const row = ws.getRow(4 + idx);
      row.height = 16;

      [idx + 1, emp.fullName || '', emp.position?.name || '', emp.department?.name || ''].forEach((v, ci) => {
        applyCell(row.getCell(ci + 1), v, {
          alignment: { horizontal: ci === 0 ? 'center' : 'left', vertical: 'middle' },
          font: { size: 9 },
        });
      });

      days.forEach((day, di) => {
        const ds = localDateStr(day);
        const daySlot = lookup.get(`${emp.id}_${ds}`);
        const colS = FIX + 1 + di * 3; // 3 sub-cols per day
        const isSun = day.getDay() === 0;
        const isLeave = daySlot?.isOnLeave ?? false;

        (['S', 'C', 'T'] as const).forEach((k, si) => {
          const col = colS + si;
          let val = '';
          if (daySlot) {
            if (daySlot[k].isLeave) val = 'P';
            else if (daySlot[k].present) val = '/';
          }

          if (val === '/') colTotals.set(col, (colTotals.get(col) ?? 0) + 1);

          const isCorrected = daySlot?.[k].isCorrected ?? false;
          const cell = row.getCell(col);
          applyCell(cell, val, {
            font: isLeave
              ? { bold: true, size: 9, color: { argb: 'FFCC6600' } }
              : { size: 9 },
            // Priority: corrected > leave > sunday
            ...(isCorrected ? { fill: correctedFill } : isLeave ? { fill: leaveFill } : isSun ? { fill: sunFill } : {}),
          });
        });
      });
    });

    // Totals row — sum of '/' (present) marks per shift-slot column
    const totalRowIdx = 4 + employees.length;
    const totalRow = ws.getRow(totalRowIdx);
    totalRow.height = 18;

    // Fixed columns label
    ws.mergeCells(totalRowIdx, 1, totalRowIdx, FIX);
    applyCell(totalRow.getCell(1), 'Tổng ca làm việc', {
      font: { bold: true, size: 9 },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });

    // Fill total count per shift-slot column
    days.forEach((day, di) => {
      const colS = FIX + 1 + di * 3;
      const isSun = day.getDay() === 0;
      (['S', 'C', 'T'] as const).forEach((_k, si) => {
        const col = colS + si;
        const total = colTotals.get(col) ?? 0;
        applyCell(totalRow.getCell(col), total || '', {
          font: { bold: true, size: 9, ...(isSun ? { color: { argb: 'FFCC0000' } } : {}) },
          ...(isSun ? { fill: sunFill } : {}),
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
