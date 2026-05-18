/**
 * AttendanceExportService — thin orchestrator for Excel exports.
 *
 * Delegates to focused sub-services:
 *   - AttendanceExportDetailService  → exportReport (flat session list)
 *   - AttendanceExportCombinedService → exportCombinedReport (2-sheet: grid + summary)
 */
import { Injectable } from '@nestjs/common';
import { AttendanceExportDetailService } from './attendance-export-detail.service';
import { AttendanceExportCombinedService } from './attendance-export-combined.service';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { Response } from 'express';

@Injectable()
export class AttendanceExportService {
  constructor(
    private readonly detailService: AttendanceExportDetailService,
    private readonly combinedService: AttendanceExportCombinedService,
  ) {}

  exportReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.detailService.exportReport(dto, user, res);
  }

  /** Export Ca cố định (FIXED): 2 sheets — grid + summary, employees with workingMode=FIXED */
  exportGridReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.combinedService.exportCombined(dto, 'FIXED', user, res);
  }

  /** Export Command Center (SHIFT): 2 sheets — grid + summary, employees with workingMode=SHIFT */
  exportSummaryReport(dto: ReportAttendanceDto, user: { id: number; role: string }, res: Response) {
    return this.combinedService.exportCombined(dto, 'SHIFT', user, res);
  }
}
