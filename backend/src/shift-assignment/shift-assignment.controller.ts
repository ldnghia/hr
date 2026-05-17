import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ShiftAssignmentService } from './shift-assignment.service';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { BulkAssignShiftDto } from './dto/bulk-assign-shift.dto';
import { InitializeMonthDto, CopyFromPreviousDto, ResetToDefaultDto } from './dto/initialize-month.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Shift Assignments')
@ApiBearerAuth('JWT-auth')
@Controller('shift-assignments')
export class ShiftAssignmentController {
  constructor(private readonly service: ShiftAssignmentService) {}

  // GET /shift-assignments/me?year=&month=
  @Get('me')
  @ApiOperation({ summary: 'Get my shift assignments for a month' })
  @ApiQuery({ name: 'year',  required: true,  type: Number })
  @ApiQuery({ name: 'month', required: true,  type: Number })
  getMyAssignments(
    @Query('year',  ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.getMyAssignments(year, month, userId);
  }

  // GET /shift-assignments?year=&month=&departmentId=&branchId=
  @Get()
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Get month shift matrix (admin, hr, manager)' })
  @ApiQuery({ name: 'year',         required: true,  type: Number })
  @ApiQuery({ name: 'month',        required: true,  type: Number })
  @ApiQuery({ name: 'departmentId', required: false, type: Number })
  @ApiQuery({ name: 'branchId',     required: false, type: Number })
  getMonthMatrix(
    @Query('year',         ParseIntPipe) year: number,
    @Query('month',        ParseIntPipe) month: number,
    @Query('departmentId') departmentIdRaw?: string,
    @Query('branchId')     branchIdRaw?: string,
    @CurrentUser('id')     userId?: number,
    @CurrentUser('role')   userRole?: string,
  ) {
    const departmentId = departmentIdRaw ? Number(departmentIdRaw) : undefined;
    const branchId     = branchIdRaw     ? Number(branchIdRaw)     : undefined;
    return this.service.getMonthMatrix(
      year, month,
      { departmentId, branchId },
      userId!,
      userRole!,
    );
  }

  // POST /shift-assignments/initialize-month
  @Post('initialize-month')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Initialize month from employee default shifts (admin, hr)' })
  initializeMonth(@Body() dto: InitializeMonthDto) {
    return this.service.initializeMonth(dto);
  }

  // POST /shift-assignments/copy-from-previous
  @Post('copy-from-previous')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Copy shift assignments from previous month (admin, hr)' })
  copyFromPrevious(@Body() dto: CopyFromPreviousDto) {
    return this.service.copyFromPrevious(dto);
  }

  // POST /shift-assignments/bulk
  @Post('bulk')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Bulk assign a shift to multiple employees' })
  bulkAssign(
    @Body() dto: BulkAssignShiftDto,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.bulkAssign(dto, userId, userRole);
  }

  // POST /shift-assignments/reset-to-default
  @Post('reset-to-default')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Reset all assignments back to employee default shifts (admin, hr)' })
  resetToDefault(@Body() dto: ResetToDefaultDto) {
    return this.service.resetToDefault(dto);
  }

  // POST /shift-assignments/apply-department-shifts
  @Post('apply-department-shifts')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'Re-apply department-linked shifts for employees in mapped departments (admin, hr)' })
  applyDepartmentShifts(@Body() dto: InitializeMonthDto) {
    return this.service.applyDepartmentShifts(dto);
  }

  // POST /shift-assignments
  @Post()
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Assign a shift to one employee' })
  assign(
    @Body() dto: AssignShiftDto,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.assign(dto, userId, userRole);
  }

  // DELETE /shift-assignments/:id
  @Delete(':id')
  @Roles('admin', 'hr', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a shift assignment' })
  unassign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.unassign(id, userId, userRole);
  }
}
