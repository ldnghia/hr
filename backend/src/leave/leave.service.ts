import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { LeaveBalanceService } from './leave-balance.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ListLeaveRequestDto } from './dto/list-leave-request.dto';
import { PaginationDto, paginate, buildPaginatedResponse } from '../common/dto/pagination.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Count weekdays (Mon–Fri) between two dates, inclusive. */
function calculateBusinessDays(fromDate: Date, toDate: Date): number {
  if (toDate < fromDate) return 0;
  let count = 0;
  const cursor = new Date(fromDate.getTime());
  while (cursor <= toDate) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

const EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  email: true,
  role: true,
  managerId: true,
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true, email: true } },
};

const REQUEST_INCLUDE = {
  employee: { select: EMPLOYEE_SELECT },
  approvals: { orderBy: { step: 'asc' as const } },
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly auditService: AuditService,
    private readonly leaveBalanceService: LeaveBalanceService,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async createRequest(dto: CreateLeaveRequestDto, employeeId: number) {
    const fromDate = new Date(dto.fromDate);
    const toDate = new Date(dto.toDate);

    if (toDate < fromDate) {
      throw new BadRequestException('toDate must be on or after fromDate');
    }

    // Half-day: fromDate must equal toDate and counts as 0.5 day
    if (dto.isHalfDay && dto.fromDate !== dto.toDate) {
      throw new BadRequestException('Half-day leave must have fromDate equal to toDate');
    }

    const businessDays = calculateBusinessDays(fromDate, toDate);
    if (businessDays === 0) {
      throw new BadRequestException(
        'Leave must include at least one business day (Mon–Fri)',
      );
    }

    const days = dto.isHalfDay ? 0.5 : businessDays;

    // ── Resolve workflow steps (validates manager is assigned) ────────────
    const steps = await this.workflowEngine.buildSteps(employeeId);

    // ── Check leave balance (skip for unpaid and compensatory) ────────────
    if (dto.leaveType !== 'unpaid' && dto.leaveType !== 'compensatory') {
      const balance = await this.prisma.leaveBalance.findUnique({
        where: { employeeId },
      });
      if (balance && Number(balance.remaining) < days) {
        throw new BadRequestException(
          `Insufficient leave balance. Available: ${balance.remaining} day(s), requested: ${days}`,
        );
      }
    }

    // ── Persist request + pre-create one approval record per step ─────────
    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        employeeId,
        fromDate,
        toDate,
        type: dto.leaveType,
        reason: dto.reason,
        days,
        isHalfDay: dto.isHalfDay ?? false,
        status: 'pending',
        currentStep: 1,
        approvals: {
          create: steps.map((s) => ({
            step: s.step,
            approverRole: s.approverRole,
            approverId: s.assignedApproverId,
            status: 'pending',
          })),
        },
      },
      include: REQUEST_INCLUDE,
    });

    // ── Audit log ─────────────────────────────────────────────────────────
    await this.auditService.log(employeeId, 'LEAVE_REQUEST_CREATED', 'leave_request', leaveRequest.id, {
      type: dto.leaveType,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      days,
    });

    return leaveRequest;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async findAll(dto: ListLeaveRequestDto) {
    const { page = 1, limit = 20, status, leaveType, employeeId } = dto;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (status) where.status = status;
    if (leaveType) where.type = leaveType;
    if (employeeId) where.employeeId = Number(employeeId);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findMy(employeeId: number, dto: PaginationDto & { status?: string }) {
    const { page = 1, limit = 20, status } = dto;
    const { skip, take } = paginate(page, limit);

    const where: any = { employeeId };
    if (status) where.status = status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException(`Leave request #${id} not found`);
    return request;
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async cancel(id: number, employeeId: number) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Leave request not found');

    if (request.employeeId !== employeeId) {
      throw new ForbiddenException('You can only cancel your own leave requests');
    }
    if (request.status !== 'pending' && request.status !== 'approved') {
      throw new BadRequestException('Only pending or approved requests can be cancelled');
    }

    // If cancelling an approved leave whose start date is in the future, refund balance
    const wasApproved = request.status === 'approved';
    if (wasApproved && request.fromDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(request.fromDate) <= today) {
        throw new BadRequestException('Cannot cancel an approved leave that has already started');
      }

      // Refund balance and remove attendance leave markers
      if (request.type !== 'unpaid' && request.type !== 'compensatory' && request.days) {
        await this.leaveBalanceService.refund(employeeId, Number(request.days));
      }

      // Remove isOnLeave markers from attendance
      if (request.fromDate && request.toDate) {
        await this.prisma.attendance.updateMany({
          where: { employeeId, leaveRequestId: id },
          data: { isOnLeave: false, leaveRequestId: null },
        });
      }
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'cancelled' },
      include: REQUEST_INCLUDE,
    });

    await this.auditService.log(
      employeeId,
      wasApproved ? 'LEAVE_APPROVED_CANCELLED' : 'LEAVE_REQUEST_CANCELLED',
      'leave_request',
      id,
    );

    return updated;
  }

  // ── Balance ───────────────────────────────────────────────────────────────

  async getMyBalance(employeeId: number) {
    const [balance, accrualLog] = await Promise.all([
      this.leaveBalanceService.getBalance(employeeId),
      this.leaveBalanceService.getAccrualLog(employeeId),
    ]);
    return { balance, accrualLog };
  }

  // ── Inbox queries ─────────────────────────────────────────────────────────

  /** Step-1 inbox: pending requests whose employee.manager_id = this manager */
  async getPendingForManager(managerId: number) {
    return this.prisma.leaveRequest.findMany({
      where: {
        status: 'pending',
        currentStep: 1,
        employee: { managerId },
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Step-2 inbox: requests that passed manager approval and are waiting for HR */
  async getPendingForHR() {
    return this.prisma.leaveRequest.findMany({
      where: {
        status: 'pending',
        currentStep: 2,
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }
}
