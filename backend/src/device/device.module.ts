import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { DeviceValidationService } from './device-validation.service';

@Module({
  controllers: [DeviceController],
  providers: [DeviceService, DeviceValidationService],
  exports: [DeviceValidationService],
})
export class DeviceModule {}
