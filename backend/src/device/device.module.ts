import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { DeviceValidationService } from './device-validation.service';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [SystemConfigModule],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceValidationService],
  exports: [DeviceValidationService],
})
export class DeviceModule {}
