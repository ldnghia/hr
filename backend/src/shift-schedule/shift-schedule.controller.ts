import {
  Controller, Get, Post, Delete,
  Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ShiftScheduleService } from './shift-schedule.service';
import { AssignDayShiftDto } from './dto/assign-day-shift.dto';
import { BulkAssignRangeDto } from './dto/bulk-assign-range.dto';
import { ListSchedulesQueryDto } from './dto/list-schedules-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Shift Schedules')
@ApiBearerAuth('JWT-auth')
@Controller('shift-schedules')
export class ShiftScheduleController {
  constructor(private readonly service: ShiftScheduleService) {}

  // GET /shift-schedules/me?year=&month=
  @Get('me')
  @ApiOperation({ summary: 'Get my per-day shift schedules for a month' })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({ name: 'month', required: true, type: Number })
  getMine(
    @Query('year',  ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.getMine(year, month, userId);
  }

  // GET /shift-schedules?year=&month=&departmentId=&employeeId=
  @Get()
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'List per-day shift schedules for a month (admin, hr, manager)' })
  getMonth(
    @Query() query: ListSchedulesQueryDto,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.getMonth(query, { id: userId, role: userRole });
  }

  // POST /shift-schedules
  @Post()
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Assign a shift to an employee on a specific date' })
  assignDay(
    @Body() dto: AssignDayShiftDto,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.assignDay(dto, { id: userId, role: userRole });
  }

  // POST /shift-schedules/bulk
  @Post('bulk')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Bulk assign a shift to employees over a date range' })
  bulkAssignRange(
    @Body() dto: BulkAssignRangeDto,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.bulkAssignRange(dto, { id: userId, role: userRole });
  }

  // DELETE /shift-schedules/:id
  @Delete(':id')
  @Roles('admin', 'hr', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a per-day shift schedule entry' })
  removeOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.removeOne(id, { id: userId, role: userRole });
  }

  // GET /shift-schedules/day-offs?dateFrom=&dateTo=&departmentId=
  @Get('day-offs')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'List day-off records for a date range' })
  listDayOffs(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo')   dateTo: string,
    @Query('departmentId') departmentId: string,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.listDayOffs(
      { dateFrom, dateTo, departmentId: departmentId ? Number(departmentId) : undefined },
      { id: userId, role: userRole },
    );
  }

  // POST /shift-schedules/day-offs
  @Post('day-offs')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Assign or update a day-off record' })
  assignDayOff(
    @Body() dto: { employeeId: number; date: string; offType: string; note?: string },
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.assignDayOff(dto, { id: userId, role: userRole });
  }

  // DELETE /shift-schedules/day-offs/:id
  @Delete('day-offs/:id')
  @Roles('admin', 'hr', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a day-off record' })
  removeDayOff(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id')   userId: number,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.removeDayOff(id, { id: userId, role: userRole });
  }
}
