import { Module } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveApprovalService } from './leave-approval.service';
import { LeaveBalanceService } from './leave-balance.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { LeaveExportService } from './leave-export.service';
import { LeaveController } from './leave.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    LeaveApprovalService,
    LeaveBalanceService,
    WorkflowEngineService,
    LeaveExportService,
  ],
  exports: [LeaveService, LeaveBalanceService, WorkflowEngineService],
})
export class LeaveModule {}
