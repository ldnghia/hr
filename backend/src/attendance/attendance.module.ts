import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AttendanceService } from './attendance.service';
import { AttendanceCheckinService } from './attendance-checkin.service';
import { AttendanceQueryService } from './attendance-query.service';
import { AttendanceExportService } from './attendance-export.service';
import { AttendanceExportDetailService } from './attendance-export-detail.service';
import { AttendanceExportGridService } from './attendance-export-grid.service';
import { AttendanceExportSummaryService } from './attendance-export-summary.service';
import { AttendanceExportCombinedService } from './attendance-export-combined.service';
import { AttendanceProcessorService } from './attendance-processor.service';
import { AttendanceController } from './attendance.controller';
import { ShiftService } from './shift.service';
import { ShiftResolverService } from './helpers/shift-resolver';
import { LocationService } from './location.service';
import { CalendarModule } from '../calendar/calendar.module';
import { DeviceModule } from '../device/device.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [ScheduleModule.forRoot(), CalendarModule, DeviceModule, SystemConfigModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceCheckinService,
    AttendanceQueryService,
    AttendanceExportService,
    AttendanceExportDetailService,
    AttendanceExportGridService,
    AttendanceExportSummaryService,
    AttendanceExportCombinedService,
    AttendanceProcessorService,
    ShiftService,
    ShiftResolverService,
    LocationService,
  ],
  exports: [AttendanceService, ShiftService, LocationService],
})
export class AttendanceModule {}
