import {
  Controller,
  Get,
  Post,
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
  ApiParam,
} from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { LeaveApprovalService } from './leave-approval.service';
import { LeaveBalanceService } from './leave-balance.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ActionLeaveDto } from './dto/action-leave.dto';
import { AdjustBalanceDto, AccrueLeaveDto } from './dto/adjust-balance.dto';
import { ListLeaveRequestDto } from './dto/list-leave-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Leave')
@ApiBearerAuth('JWT-auth')
@Controller('leave-request')
export class LeaveController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly leaveApprovalService: LeaveApprovalService,
    private readonly leaveBalanceService: LeaveBalanceService,
  ) {}

  // ── POST /leave-request ───────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a leave request',
    description:
      'Business days (Mon-Fri) are auto-calculated from fromDate/toDate. ' +
      'Step 1 is pre-assigned to the direct manager. Step 2 is open to any HR user.',
  })
  createRequest(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.leaveService.createRequest(dto, employeeId);
  }

  // ── GET /leave-request/my ─────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Get own leave requests' })
  getMyRequests(
    @CurrentUser('id') employeeId: number,
    @Query() query: ListLeaveRequestDto,
  ) {
    return this.leaveService.findMy(employeeId, query);
  }

  // ── GET /leave-request/balance ────────────────────────────────────────────

  @Get('balance')
  @ApiOperation({ summary: 'Get own leave balance and accrual history' })
  getMyBalance(@CurrentUser('id') employeeId: number) {
    return this.leaveService.getMyBalance(employeeId);
  }

  // ── GET /leave-request/balance/all (admin / hr) ───────────────────────────

  @Get('balance/all')
  @Roles('admin', 'hr')
  @ApiOperation({ summary: 'List all employees leave balances (admin, hr)' })
  getAllBalances() {
    return this.leaveBalanceService.getAllBalances();
  }

  // ── GET /leave-request/balance/:employeeId (admin / hr / manager) ─────────

  @Get('balance/:employeeId')
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'Get leave balance for a specific employee (admin, hr, manager)' })
  @ApiParam({ name: 'employeeId', type: Number })
  getEmployeeBalance(@Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.leaveBalanceService.getBalance(employeeId);
  }

  // ── POST /leave-request/balance/accrue (admin / hr) ───────────────────────

  @Post('balance/accrue')
  @Roles('admin', 'hr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger leave accrual (admin, hr)' })
  accrueLeave(@Body() dto: AccrueLeaveDto) {
    const days = dto.daysPerEmployee ?? 1.0;
    const note = dto.note ?? `Manual accrual — ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
    return this.leaveBalanceService.accrueManually(days, note, dto.employeeId);
  }

  // ── PATCH /leave-request/balance/:employeeId (admin / hr) ─────────────────

  @Post('balance/:employeeId')
  @Roles('admin', 'hr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set leave balance total for an employee (admin, hr)' })
  @ApiParam({ name: 'employeeId', type: Number })
  setBalance(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AdjustBalanceDto,
  ) {
    return this.leaveBalanceService.setBalance(employeeId, dto.total, dto.reason);
  }

  // ── GET /leave-request/pending/manager ───────────────────────────────────

  @Get('pending/manager')
  @Roles('manager', 'admin')
  @ApiOperation({ summary: 'Step-1 inbox: leave requests awaiting manager approval' })
  getPendingForManager(@CurrentUser('id') managerId: number) {
    return this.leaveService.getPendingForManager(managerId);
  }

  // ── GET /leave-request/pending/hr ────────────────────────────────────────

  @Get('pending/hr')
  @Roles('hr', 'admin')
  @ApiOperation({ summary: 'Step-2 inbox: leave requests awaiting HR approval' })
  getPendingForHR() {
    return this.leaveService.getPendingForHR();
  }

  // ── GET /leave-request (admin / hr / manager list) ────────────────────────

  @Get()
  @Roles('admin', 'hr', 'manager')
  @ApiOperation({ summary: 'List all leave requests (admin, hr, manager)' })
  findAll(@Query() dto: ListLeaveRequestDto) {
    return this.leaveService.findAll(dto);
  }

  // ── GET /leave-request/:id ────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get leave request detail' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leaveService.findOne(id);
  }

  // ── POST /leave-request/:id/approve ──────────────────────────────────────

  @Post(':id/approve')
  @Roles('manager', 'hr', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve at current step',
    description:
      'Step 1: direct manager only. Step 2: any HR user. ' +
      'Final approval sets status=approved and deducts leave balance.',
  })
  @ApiParam({ name: 'id', type: Number })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActionLeaveDto,
    @CurrentUser('id') actorId: number,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.leaveApprovalService.approve(id, dto, actorId, actorRole);
  }

  // ── POST /leave-request/:id/reject ───────────────────────────────────────

  @Post(':id/reject')
  @Roles('manager', 'hr', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject at current step',
    description: 'Rejection at any step immediately closes the request as rejected.',
  })
  @ApiParam({ name: 'id', type: Number })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActionLeaveDto,
    @CurrentUser('id') actorId: number,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.leaveApprovalService.reject(id, dto, actorId, actorRole);
  }

  // ── POST /leave-request/:id/cancel ───────────────────────────────────────

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel own pending leave request' })
  @ApiParam({ name: 'id', type: Number })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.leaveService.cancel(id, employeeId);
  }
}
