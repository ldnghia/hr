import { Module } from '@nestjs/common';
import { ShiftAssignmentService } from './shift-assignment.service';
import { ShiftAssignmentController } from './shift-assignment.controller';

@Module({
  controllers: [ShiftAssignmentController],
  providers: [ShiftAssignmentService],
  exports: [ShiftAssignmentService],
})
export class ShiftAssignmentModule {}
