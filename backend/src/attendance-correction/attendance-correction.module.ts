import { Module } from '@nestjs/common';
import { AttendanceCorrectionController } from './attendance-correction.controller';
import { AttendanceCorrectionService } from './attendance-correction.service';
import { AttendanceCorrectionLimitService } from './attendance-correction-limit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [PrismaModule, SystemConfigModule],
  controllers: [AttendanceCorrectionController],
  providers: [AttendanceCorrectionService, AttendanceCorrectionLimitService],
})
export class AttendanceCorrectionModule {}
