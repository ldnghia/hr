import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { LeaveBalanceService } from './leave-balance.service';
import { ActionLeaveDto } from './dto/action-leave.dto';

@Injectable()
export class LeaveApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly auditService: AuditService,
    private readonly leaveBalanceService: LeaveBalanceService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Approve
  // ─────────────────────────────────────────────────────────────────────────

  async approve(
    leaveRequestId: number,
    dto: ActionLeaveDto,
    actorId: number,
    actorRole: string,
  ) {
    const { request, stepRecord } = await this.loadAndGuard(
      leaveRequestId,
      actorId,
      actorRole,
    );

    const currentStep = request.currentStep ?? 1;

    await this.prisma.leaveApproval.update({
      where: { id: stepRecord.id },
      data: {
        status: 'approved',
        approverId: actorId,
        comments: dto.comments ?? null,
        actionTime: new Date(),
      },
    });

    if (this.workflowEngine.isLastStep(currentStep)) {
      await this.finalise(leaveRequestId, request.employeeId, request.days, request.type);

      await this.auditService.log(actorId, 'LEAVE_APPROVED', 'leave_request', leaveRequestId, {
        step: currentStep,
        comments: dto.comments ?? null,
      });

      return {
        message: 'Leave request fully approved',
        status: 'approved',
        currentStep,
      };
    }

    const nextStep = currentStep + 1;

    await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { currentStep: nextStep },
    });

    await this.auditService.log(actorId, 'LEAVE_STEP_APPROVED', 'leave_request', leaveRequestId, {
      step: currentStep,
      nextStep,
      comments: dto.comments ?? null,
    });

    return {
      message: `Step ${currentStep} approved. Awaiting step ${nextStep} (HR)`,
      status: 'pending',
      currentStep: nextStep,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reject
  // ─────────────────────────────────────────────────────────────────────────

  async reject(
    leaveRequestId: number,
    dto: ActionLeaveDto,
    actorId: number,
    actorRole: string,
  ) {
    const { request, stepRecord } = await this.loadAndGuard(
      leaveRequestId,
      actorId,
      actorRole,
    );

    const currentStep = request.currentStep ?? 1;

    await this.prisma.$transaction([
      this.prisma.leaveApproval.update({
        where: { id: stepRecord.id },
        data: {
          status: 'rejected',
          approverId: actorId,
          comments: dto.comments ?? null,
          actionTime: new Date(),
        },
      }),
      this.prisma.leaveRequest.update({
        where: { id: leaveRequestId },
        data: { status: 'rejected' },
      }),
    ]);

    await this.auditService.log(actorId, 'LEAVE_REJECTED', 'leave_request', leaveRequestId, {
      step: currentStep,
      comments: dto.comments ?? null,
    });

    return {
      message: `Leave request rejected at step ${currentStep}`,
      status: 'rejected',
      currentStep,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async loadAndGuard(
    leaveRequestId: number,
    actorId: number,
    actorRole: string,
  ) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: { approvals: { orderBy: { step: 'asc' } } },
    });

    if (!request) {
      throw new NotFoundException(`Leave request #${leaveRequestId} not found`);
    }

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Leave request is already ${request.status} — no further action allowed`,
      );
    }

    const currentStep = request.currentStep ?? 1;

    const stepRecord = request.approvals.find((a) => a.step === currentStep);
    if (!stepRecord) {
      throw new BadRequestException(
        `Workflow integrity error: no approval record for step ${currentStep}`,
      );
    }

    // Guard: cannot approve a step that was already acted on
    if (stepRecord.status !== 'pending') {
      throw new BadRequestException(
        `Step ${currentStep} was already ${stepRecord.status} — you cannot act on it again`,
      );
    }

    // Guard: validate the actor is authorised for the current step (role + identity)
    this.workflowEngine.validateAuthorisation(
      currentStep,
      actorId,
      actorRole,
      stepRecord.approverId,
    );

    return { request, stepRecord };
  }

  private async finalise(
    leaveRequestId: number,
    employeeId: number | null,
    days: number | null,
    leaveType: string | null,
  ) {
    // 1. Mark request as approved
    const request = await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: 'approved' },
    });

    if (!employeeId || !days) return;

    // 2. Deduct leave balance (skip for unpaid and compensatory leave)
    if (leaveType !== 'unpaid' && leaveType !== 'compensatory') {
      await this.leaveBalanceService.deduct(employeeId, days);
    }

    // 3. Mark each leave calendar day as attendance (absent-valid)
    if (request.fromDate && request.toDate) {
      const cursor = new Date(request.fromDate);
      const end = new Date(request.toDate);

      while (cursor <= end) {
        const dateOnly = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()));

        await this.prisma.attendance.upsert({
          where: { employeeId_date: { employeeId, date: dateOnly } },
          create: {
            employeeId,
            date: dateOnly,
            isOnLeave: true,
            leaveRequestId,
          },
          update: {
            isOnLeave: true,
            leaveRequestId,
          },
        });

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
  }
}
