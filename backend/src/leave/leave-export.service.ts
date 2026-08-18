/**
 * LeaveExportService — Excel export for the detailed leave report, grouped by employee.
 * One sheet: an employee header row (merged, bold) followed by that employee's leave
 * rows, then a subtotal row, repeated per employee.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExportLeaveReportDto } from './dto/export-leave-report.dto';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { formatDate } from '../common/utils/format';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
};

const TYPE_LABEL: Record<string, string> = {
  annual: 'Nghỉ phép năm',
  sick: 'Nghỉ ốm',
  unpaid: 'Nghỉ không lương',
  compensatory: 'Nghỉ bù',
};

const COLUMN_COUNT = 6;

@Injectable()
export class LeaveExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportDetail(dto: ExportLeaveReportDto, res: Response) {
    const where: any = {};
    if (dto.status) where.status = dto.status;
    if (dto.leaveType) where.type = dto.leaveType;
    if (dto.departmentId) where.employee = { departmentId: Number(dto.departmentId) };

    if (dto.year) {
      where.toDate = { gte: new Date(`${dto.year}-01-01`) };
      where.fromDate = { lte: new Date(`${dto.year}-12-31`) };
    } else {
      if (dto.dateFrom) where.toDate = { gte: new Date(dto.dateFrom) };
      if (dto.dateTo) where.fromDate = { ...(where.fromDate ?? {}), lte: new Date(dto.dateTo) };
    }

    const requests = await this.prisma.leaveRequest.findMany({
      where,
      include: {
        employee: { select: { code: true, fullName: true, department: { select: { name: true } } } },
      },
      orderBy: [{ employeeId: 'asc' }, { fromDate: 'asc' }],
    });

    const employeeIds = [...new Set(requests.map((r) => r.employeeId).filter((id): id is number => id != null))];
    const balances = await this.prisma.leaveBalance.findMany({
      where: { employeeId: { in: employeeIds } },
    });
    const balanceByEmployee = new Map(balances.map((b) => [b.employeeId, b]));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Báo cáo nghỉ phép chi tiết');

    worksheet.columns = [
      { key: 'type', width: 20 },
      { key: 'reason', width: 35 },
      { key: 'fromDate', width: 15 },
      { key: 'toDate', width: 15 },
      { key: 'days', width: 12 },
      { key: 'status', width: 15 },
    ];

    const headerRow = worksheet.addRow(['Loại nghỉ', 'Lý do', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Trạng thái']);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    const groups = new Map<number, typeof requests>();
    for (const r of requests) {
      const key = r.employeeId ?? 0;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    for (const [employeeId, rows] of groups) {
      const employee = rows[0].employee;
      const groupHeaderRow = worksheet.addRow([
        `${employee?.fullName ?? '—'} (${employee?.code ?? '—'}) — ${employee?.department?.name ?? '—'}`,
      ]);
      worksheet.mergeCells(groupHeaderRow.number, 1, groupHeaderRow.number, COLUMN_COUNT);
      groupHeaderRow.font = { bold: true };
      groupHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

      const balance = balanceByEmployee.get(employeeId);
      const compensatoryDays = rows
        .filter((r) => r.type === 'compensatory' && r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.days ?? 0), 0);
      const unpaidDays = rows
        .filter((r) => r.type === 'unpaid' && r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.days ?? 0), 0);
      const balanceRow = worksheet.addRow([
        `Tổng số phép: ${balance ? Number(balance.total) : 0}    |    Đã dùng phép: ${balance ? Number(balance.used) : 0}    |    Nghỉ bù: ${compensatoryDays}    |    Nghỉ không lương: ${unpaidDays}`,
      ]);
      worksheet.mergeCells(balanceRow.number, 1, balanceRow.number, COLUMN_COUNT);
      balanceRow.font = { italic: true, color: { argb: 'FF6B7280' } };

      let totalDays = 0;
      for (const r of rows) {
        totalDays += Number(r.days ?? 0);
        worksheet.addRow({
          type: TYPE_LABEL[r.type ?? ''] ?? r.type ?? '-',
          reason: r.reason || '-',
          fromDate: formatDate(r.fromDate),
          toDate: formatDate(r.toDate),
          days: r.days ?? 0,
          status: STATUS_LABEL[r.status ?? ''] ?? r.status ?? '-',
        });
      }

      const subtotalRow = worksheet.addRow(['', '', '', 'Tổng số ngày nghỉ trong kỳ', totalDays, '']);
      subtotalRow.font = { italic: true };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const suffix = dto.year ? String(dto.year) : formatDate(new Date());
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Bao_Cao_Nghi_Phep_Chi_Tiet_${suffix}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }
}
