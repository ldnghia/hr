import { Module } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { AuditModule } from '../audit/audit.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [AuditModule, SystemConfigModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
