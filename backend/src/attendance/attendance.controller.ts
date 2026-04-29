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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { AttendanceProcessorService } from './attendance-processor.service';
import { ShiftService } from './shift.service';
import { LocationService } from './location.service';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { ReportAttendanceDto } from './dto/report-attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateShiftDto } from './dto/create-shift.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AttendanceListDto } from './dto/attendance-list.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ── Legacy manual check DTO (kept for backward compat) ──────────────────────
class CheckInOutDto {
  @ApiPropertyOptional({ enum: ['check_in', 'check_out'] })
  @IsIn(['check_in', 'check_out'])
  type: 'check_in' | 'check_out';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timestamp?: string;
}

// ── My-records query ──────────────────────────────────────────────────────────
class MyRecordsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;
}

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
      'Auto-detects active shift. Marks late if after grace period. ' +
      'Creates an AttendanceLog entry.',
  })
  checkIn(
    @Body() dto: CheckInDto,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.attendanceService.checkIn(employeeId, dto);
  }

  // ── POST /attendance/check-out ────────────────────────────────────────────

  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'WFM check-out with OT/early-out detection',
    description:
      'Calculates working hours. Marks overtime if worked beyond shift + grace. ' +
      'Marks early-out if checkout before shift end - grace. Creates an AttendanceLog entry.',
  })
  checkOut(
    @Body() dto: CheckOutDto,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.attendanceService.checkOut(employeeId, dto);
  }

  // ── GET /attendance/me ────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get my attendance records (paginated)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  getMyRecords(
    @CurrentUser('id') employeeId: number,
    @Query() query: MyRecordsDto,
  ) {
    return this.attendanceService.getMyRecords(employeeId, query);
  }

  // ── POST /attendance/check (legacy) ──────────────────────────────────────

  @Post('check')
  @ApiOperation({ summary: 'Legacy manual check-in or check-out (no GPS)' })
  checkInOut(
    @Body() dto: CheckInOutDto,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.attendanceService.checkInOut(employeeId, dto.type, dto.timestamp);
  }

  // ── GET /attendance/today ─────────────────────────────────────────────────

  @Get('today')
  @ApiOperation({ summary: 'Get my attendance status for today' })
  getTodayStatus(@CurrentUser('id') employeeId: number) {
    return this.attendanceService.findTodayStatus(employeeId);
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

  // ── GET /attendance/report ────────────────────────────────────────────────
  @Get('report')
  @Roles('admin', 'hr', 'manager', 'employee')
  @ApiOperation({ summary: 'Attendance report with filters' })
  getReport(
    @Query() dto: ReportAttendanceDto,
    @CurrentUser() user: { id: number; role: string }
  ) {
    return this.attendanceService.getReport(dto, user);
  }

  @Get('report/export')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Export attendance report to Excel (list format)' })
  exportReport(
    @Query() dto: ReportAttendanceDto,
    @CurrentUser() user: { id: number; role: string },
    @Res() res: any,
  ) {
    return this.attendanceService.exportReport(dto, user, res);
  }

  @Get('report/export-grid')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Export attendance report to Excel (grid/matrix format)' })
  exportGridReport(
    @Query() dto: ReportAttendanceDto,
    @CurrentUser() user: { id: number; role: string },
    @Res() res: any,
  ) {
    return this.attendanceService.exportGridReport(dto, user, res);
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

  // ══ Shifts ══════════════════════════════════════════════════════════════════

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
  updateShift(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateShiftDto>,
  ) {
    return this.shiftService.update(id, dto);
  }

  // ══ Locations ════════════════════════════════════════════════════════════════

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
  updateLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateLocationDto>,
  ) {
    return this.locationService.update(id, dto);
  }
}
