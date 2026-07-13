import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AttendanceCorrectionService } from './attendance-correction.service';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import { UpdateCorrectionDto } from './dto/update-correction.dto';
import { ApproveCorrectionDto, RejectCorrectionDto } from './dto/review-correction.dto';
import { AdminEditAttendanceDto } from './dto/admin-edit-attendance.dto';
import { ListCorrectionQueryDto } from './dto/list-correction-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Attendance Correction')
@ApiBearerAuth('JWT-auth')
@Controller()
export class AttendanceCorrectionController {
  constructor(private readonly service: AttendanceCorrectionService) {}

  // POST /attendance-correction
  @Post('attendance-correction')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit an attendance correction request' })
  create(
    @Body() dto: CreateCorrectionDto,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.service.create(dto, employeeId);
  }

  // GET /attendance-correction
  @Get('attendance-correction')
  @ApiOperation({ summary: 'List correction requests (admin/hr: all; employee: own)' })
  list(
    @Query() query: ListCorrectionQueryDto,
    @CurrentUser('id') requesterId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.service.list(query, requesterId, role);
  }

  // GET /attendance-correction/:id
  @Get('attendance-correction/:id')
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Get correction request detail' })
  getById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') requesterId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getById(id, requesterId, role);
  }

  // PATCH /attendance-correction/:id
  @Patch('attendance-correction/:id')
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Edit a pending correction request (owner or admin/hr)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCorrectionDto,
    @CurrentUser('id') requesterId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.service.update(id, dto, requesterId, role);
  }

  // POST /attendance-correction/:id/approve
  @Post('attendance-correction/:id/approve')
  @Roles('admin', 'hr')
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Approve a correction request (HR/Admin)' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveCorrectionDto,
    @CurrentUser('id') reviewerId: number,
  ) {
    return this.service.approve(id, reviewerId, dto);
  }

  // POST /attendance-correction/:id/reject
  @Post('attendance-correction/:id/reject')
  @Roles('admin', 'hr')
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Reject a correction request (HR/Admin)' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectCorrectionDto,
    @CurrentUser('id') reviewerId: number,
  ) {
    return this.service.reject(id, reviewerId, dto);
  }

  // POST /attendance-correction/:id/cancel
  @Post('attendance-correction/:id/cancel')
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Cancel own pending correction request' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.service.cancel(id, employeeId);
  }

  // PATCH /attendance/:id/admin-edit
  @Patch('attendance/:id/admin-edit')
  @Roles('admin')
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Admin directly edits an attendance record' })
  adminEdit(
    @Param('id', ParseIntPipe) attendanceId: number,
    @Body() dto: AdminEditAttendanceDto,
    @CurrentUser('id') adminId: number,
  ) {
    return this.service.adminEdit(attendanceId, adminId, dto);
  }
}
