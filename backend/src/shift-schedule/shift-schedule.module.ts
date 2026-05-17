import { Module } from '@nestjs/common';
import { ShiftScheduleService } from './shift-schedule.service';
import { ShiftScheduleController } from './shift-schedule.controller';

@Module({
  providers: [ShiftScheduleService],
  controllers: [ShiftScheduleController],
  exports: [ShiftScheduleService],
})
export class ShiftScheduleModule {}
