import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { AttendanceProcessorService } from './attendance-processor.service';
import { ShiftService } from './shift.service';
import { LocationService } from './location.service';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { DailySummaryQueryDto } from './dto/daily-summary.dto';
import { CheckInOutDto, MyRecordsQueryDto } from './dto/attendance-controller-inline.dto';
import { CreateShiftDto } from './dto/create-shift.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { AttendanceListDto } from './dto/attendance-list.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth('JWT-auth')
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly processorService: AttendanceProcessorService,
    private readonly shiftService: ShiftService,
    private readonly locationService: LocationService,
  ) {}

  // ── POST /attendance/import ───────────────────────────────────────────────

  @Post('import')
  @Roles('admin', 'hr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import raw timestamps from access devices (admin, hr)' })
  async importRaw(@Body() dto: ImportAttendanceDto) {
    const { imported, unknownCodes, dates } = await this.attendanceService.importRaw(dto);
    const { processed, skipped } = await this.processorService.processDates(dates);
    return { message: 'Import and processing complete', imported, unknownCodes, attendanceUpserted: processed, employeesSkipped: skipped };
  }

  // ── POST /attendance/check-in ─────────────────────────────────────────────

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'WFM check-in with GPS validation',
    description:
      'Validates GPS against configured work locations (if GPS provided). ' +
      'Auto-detects active shift from EmployeeShiftAssignment. ' +
      'Marks late if after grace period. Creates an AttendanceLog entry.',
  })
  @ApiResponse({ status: 200, description: 'Check-in successful; returns Attendance + shift info' })
  checkIn(@Body() dto: CheckInDto, @CurrentUser('id') employeeId: number) {
    return this.attendanceService.checkIn(employeeId, dto);
  }

  // ── POST /attendance/check-out ────────────────────────────────────────────

  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'WFM check-out with OT/early-out detection',
    description:
      'Calculates working hours. Marks overtime / early-out. ' +
      'If multiple open sessions exist and shiftId is omitted → 400 with openSessions list.',
  })
  @ApiResponse({ status: 200, description: 'Check-out successful; returns updated Attendance' })
  @ApiResponse({ status: 400, description: 'Multiple open sessions — shiftId required' })
  checkOut(@Body() dto: CheckOutDto, @CurrentUser('id') employeeId: number) {
    return this.attendanceService.checkOut(employeeId, dto);
  }

  // ── GET /attendance/today ─────────────────────────────────────────────────

  @Get('today')
  @ApiOperation({
    summary: 'Get my attendance sessions for today (array)',
    description: 'Returns all shift sessions for today. Multi-shift employees will see multiple items.',
  })
  @ApiResponse({ status: 200, description: 'Array of today\'s attendance sessions' })
  getTodaySessions(@CurrentUser('id') employeeId: number) {
    return this.attendanceService.findTodaySessions(employeeId);
  }

  // ── GET /attendance/today/active ──────────────────────────────────────────

  @Get('today/active')
  @ApiOperation({
    summary: 'Get most recent open check-in session for today (legacy shim)',
    description: 'Returns the latest open (no checkout) session or null. Backward-compat for single-session callers.',
  })
  @ApiResponse({ status: 200, description: 'Most recent open session or null' })
  async getTodayActive(@CurrentUser('id') employeeId: number) {
    const result = await this.attendanceService.findTodaySessions(employeeId);
    const openSession = result.sessions
      .filter((s: any) => s.checkinTime && !s.checkoutTime)
      .sort((a: any, b: any) => new Date(b.checkinTime).getTime() - new Date(a.checkinTime).getTime())[0] ?? null;
    return { data: openSession };
  }

  // ── GET /attendance/daily-summary ─────────────────────────────────────────

  @Get('daily-summary')
  @Roles('admin', 'hr', 'manager', 'employee')
  @ApiOperation({
    summary: 'Daily attendance summary aggregated per (employeeId, date)',
    description: 'Aggregates multiple shift sessions per day into totalHours + sessionsCount.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  @ApiQuery({ name: 'employeeId', required: false, type: Number, description: 'Filter by employee (admin/hr/manager)' })
  @ApiResponse({ status: 200, description: 'Array of daily summary objects' })
  getDailySummary(
    @CurrentUser() user: { id: number; role: string },
    @Query() query: DailySummaryQueryDto,
  ) {
    return this.attendanceService.getDailySummary(user, query.from, query.to, query.employeeId);
  }

  // ── GET /attendance/unclosed ──────────────────────────────────────────────

  @Get('unclosed')
  @ApiOperation({
    summary: 'Get my unclosed check-in sessions from previous days',
    description: 'Returns sessions where checkinTime is set but checkoutTime is null, dated before today.',
  })
  getUnclosedSessions(@CurrentUser('id') employeeId: number) {
    return this.attendanceService.getUnclosedSessions(employeeId);
  }

  // ── PATCH /attendance/:id/forgot-checkout ─────────────────────────────────

  @Patch(':id/forgot-checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark an unclosed session as forgot-checkout (no checkoutTime recorded)',
  })
  markForgotCheckout(
    @CurrentUser('id') employeeId: number,
    @Param('id', ParseIntPipe) attendanceId: number,
  ) {
    return this.attendanceService.markForgotCheckout(employeeId, attendanceId);
  }

  // ── GET /attendance/my-shifts/current-month ───────────────────────────────

  @Get('my-shifts/current-month')
  @ApiOperation({
    summary: 'List shifts assigned to me for the current month',
    description: 'Reads EmployeeShiftAssignment for current year+month. Used by frontend session cards.',
  })
  @ApiResponse({ status: 200, description: 'Array of { shiftId, shiftName, startTime, endTime, code }' })
  getMyShiftsCurrentMonth(@CurrentUser('id') employeeId: number) {
    return this.attendanceService.getMyShiftsCurrentMonth(employeeId);
  }

  // ── GET /attendance/me ────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get my attendance records (paginated)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  getMyRecords(
    @CurrentUser('id') employeeId: number,
    @Query() query: MyRecordsQueryDto,
  ) {
    return this.attendanceService.getMyRecords(employeeId, query);
  }

  // ── GET /attendance/summary ───────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get my monthly attendance summary' })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getSummary(
    @CurrentUser('id') employeeId: number,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    const now = new Date();
    return this.attendanceService.getSummary(
      employeeId,
      month ?? now.getMonth() + 1,
      year ?? now.getFullYear(),
    );
  }

  // ── POST /attendance/check (legacy) ──────────────────────────────────────

  @Post('check')
  @ApiOperation({ summary: 'Legacy manual check-in or check-out (no GPS)' })
  checkInOut(@Body() dto: CheckInOutDto, @CurrentUser('id') employeeId: number) {
    return this.attendanceService.checkInOut(employeeId, dto.type, dto.timestamp);
  }

  // ── GET /attendance/report ────────────────────────────────────────────────

  @Get('report')
  @Roles('admin', 'hr', 'manager', 'employee')
  @ApiOperation({ summary: 'Attendance report with filters' })
  getReport(@Query() dto: ReportAttendanceDto, @CurrentUser() user: { id: number; role: string }) {
    return this.attendanceService.getReport(dto, user);
  }

  @Get('report/export')
  @Roles('admin')
  @ApiOperation({ summary: 'Export attendance report to Excel (list format)' })
  exportReport(
    @Query() dto: ReportAttendanceDto,
    @CurrentUser() user: { id: number; role: string },
    @Res() res: Response,
  ) {
    return this.attendanceService.exportReport(dto, user, res);
  }

  @Get('report/export-grid')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Export attendance report to Excel (grid/matrix format)' })
  exportGridReport(
    @Query() dto: ReportAttendanceDto,
    @CurrentUser() user: { id: number; role: string },
    @Res() res: Response,
  ) {
    return this.attendanceService.exportGridReport(dto, user, res);
  }

  @Get('report/export-summary')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Export summary working-day report to Excel' })
  exportSummaryReport(
    @Query() dto: ReportAttendanceDto,
    @CurrentUser() user: { id: number; role: string },
    @Res() res: Response,
  ) {
    return this.attendanceService.exportSummaryReport(dto, user, res);
  }

  // ── GET /attendance ───────────────────────────────────────────────────────

  @Get()
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'List attendance records (admin, hr, manager)' })
  findAll(@Query() query: AttendanceListDto) {
    return this.attendanceService.findAll(query);
  }

  // ── GET /attendance/employee/:id/summary ──────────────────────────────────

  @Get('employee/:id/summary')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Monthly attendance summary for a specific employee' })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getEmployeeSummary(
    @Param('id', ParseIntPipe) employeeId: number,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    const now = new Date();
    return this.attendanceService.getSummary(
      employeeId,
      month ?? now.getMonth() + 1,
      year ?? now.getFullYear(),
    );
  }

  // ══ Shifts ════════════════════════════════════════════════════════════════

  @Get('shifts')
  @ApiOperation({ summary: 'List all shifts' })
  getShifts() {
    return this.shiftService.findAll();
  }

  @Post('shifts')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Create a shift (admin, hr)' })
  createShift(@Body() dto: CreateShiftDto) {
    return this.shiftService.create(dto);
  }

  @Patch('shifts/:id')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Update a shift (admin, hr)' })
  updateShift(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateShiftDto>) {
    return this.shiftService.update(id, dto);
  }

  // ══ Locations ════════════════════════════════════════════════════════════

  @Get('locations')
  @ApiOperation({ summary: 'List all work locations' })
  getLocations() {
    return this.locationService.findAll();
  }

  @Post('locations')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Create a work location (admin, hr)' })
  createLocation(@Body() dto: CreateLocationDto) {
    return this.locationService.create(dto);
  }

  @Patch('locations/:id')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Update a work location (admin, hr)' })
  updateLocation(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateLocationDto>) {
    return this.locationService.update(id, dto);
  }
}
