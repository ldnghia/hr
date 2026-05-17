/**
 * AttendanceExportService — thin orchestrator for Excel exports.
 *
 * Delegates to focused sub-services:
 *   - AttendanceExportDetailService  → exportReport (flat session list)
 *   - AttendanceExportGridService    → exportGridReport (employee × day matrix)
 *   - AttendanceExportSummaryService → exportSummaryReport (working-day totals)
 */
import { Injectable } from '@nestjs/common';
import { AttendanceExportDetailService } from './attendance-export-detail.service';
import { AttendanceExportGridService } from './attendance-export-grid.service';
import { AttendanceExportSummaryService } from './attendance-export-summary.service';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { Response } from 'express';

@Injectable()
export class AttendanceExportService {
  constructor(
    private readonly detailService: AttendanceExportDetailService,
    private readonly gridService: AttendanceExportGridService,
    private readonly summaryService: AttendanceExportSummaryService,
  ) {}

  exportReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.detailService.exportReport(dto, user, res);
  }

  exportGridReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.gridService.exportGridReport(dto, user, res);
  }

  exportSummaryReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.summaryService.exportSummaryReport(dto, user, res);
  }
}
