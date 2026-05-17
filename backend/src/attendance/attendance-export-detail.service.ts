/**
 * AttendanceExportDetailService — Excel export for the flat attendance report.
 * One row per session (per employee × date × shift).
 */
import { Injectable } from '@nestjs/common';
import { AttendanceQueryService } from './attendance-query.service';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { formatDate, formatDateTime } from '../common/utils/format';

@Injectable()
export class AttendanceExportDetailService {
  constructor(private readonly queryService: AttendanceQueryService) {}

  async exportReport(
    dto: ReportAttendanceDto,
    user: { id: number; role: string },
    res: Response,
  ) {
    const { data } = await this.queryService.getReport(
      { ...dto, page: 1, limit: 10000 },
      user,
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    worksheet.columns = [
      { header: 'Employee Code', key: 'code', width: 15 },
      { header: 'Full Name', key: 'name', width: 25 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Shift', key: 'shift', width: 15 },
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
        shift: r.shift?.name ?? '-',
        checkin: r.checkinTime ? formatDateTime(r.checkinTime) : '-',
        checkout: r.checkoutTime ? formatDateTime(r.checkoutTime) : '-',
        hours: r.workingHours ? Number(r.workingHours).toFixed(2) : '0.00',
        status: statusArr.join(', '),
        inNote: r.checkinNote || '-',
        outNote: r.checkoutNote || '-',
      });
    });

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
      `attachment; filename=Attendance_Report_${formatDate(new Date())}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }
}
