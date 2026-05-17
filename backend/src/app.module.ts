import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmployeeModule } from './employee/employee.module';
import { OrganizationModule } from './organization/organization.module';
import { ContractModule } from './contract/contract.module';
import { LeaveModule } from './leave/leave.module';
import { AttendanceModule } from './attendance/attendance.module';
import { WorkflowModule } from './workflow/workflow.module';
import { OffboardingModule } from './offboarding/offboarding.module';
import { RewardModule } from './reward/reward.module';
import { AuditModule } from './audit/audit.module';
import { CalendarModule } from './calendar/calendar.module';
import { OfficeModule } from './office/office.module';
import { WorkingShiftModule } from './working-shift/working-shift.module';
import { MeModule } from './me/me.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { NotificationModule } from './notification/notification.module';
import { AttendanceCorrectionModule } from './attendance-correction/attendance-correction.module';
import { ShiftAssignmentModule } from './shift-assignment/shift-assignment.module';
import { ShiftScheduleModule } from './shift-schedule/shift-schedule.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    EmployeeModule,
    MeModule,
    OrganizationModule,
    ContractModule,
    LeaveModule,
    CalendarModule,
    AttendanceModule,
    WorkflowModule,
    OffboardingModule,
    RewardModule,
    AuditModule,
    OfficeModule,
    WorkingShiftModule,
    SystemConfigModule,
    NotificationModule,
    AttendanceCorrectionModule,
    ShiftAssignmentModule,
    ShiftScheduleModule,
  ],
})
export class AppModule {}
