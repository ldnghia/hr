import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';

export interface DeviceValidationResult {
  unknown: boolean;
}

@Injectable()
export class DeviceValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  private async isDeviceCheckEnabled(): Promise<boolean> {
    const val = await this.systemConfig.get('device_check_enabled');
    return val === 'true';
  }

  /**
   * Validate device fingerprint on check-in.
   * Mode is read from employee.deviceValidationMode (STRICT | WARN | DISABLED).
   * STRICT → throws 403 if unregistered.
   * WARN   → returns { unknown: true } so caller can flag the record.
   * DISABLED → always passes.
   */
  async validateForCheckIn(
    employeeId: number,
    deviceId?: string,
  ): Promise<DeviceValidationResult> {
    if (!(await this.isDeviceCheckEnabled())) return { unknown: false };

    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { deviceValidationMode: true },
    });
    const mode = emp?.deviceValidationMode ?? 'DISABLED';

    if (mode === 'DISABLED') return { unknown: false };

    if (!deviceId) {
      if (mode === 'STRICT') throw new ForbiddenException('Thiết bị chưa được đăng ký. Vui lòng đăng ký thiết bị trước khi chấm công.');
      return { unknown: true };
    }

    const device = await this.prisma.registeredDevice.findFirst({
      where: { employeeId, deviceFingerprint: deviceId, isActive: true },
    });

    if (!device) {
      if (mode === 'STRICT') throw new ForbiddenException('Thiết bị chưa được đăng ký. Vui lòng đăng ký thiết bị trước khi chấm công.');
      return { unknown: true };
    }

    // Update last used timestamp (non-blocking)
    await this.prisma.registeredDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date() },
    });

    return { unknown: false };
  }

  /**
   * Validate device on check-out — never throws (employee may have switched device).
   * Only logs unknown device flag.
   */
  async validateForCheckOut(
    employeeId: number,
    deviceId?: string,
  ): Promise<DeviceValidationResult> {
    if (!(await this.isDeviceCheckEnabled())) return { unknown: false };

    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { deviceValidationMode: true },
    });
    const mode = emp?.deviceValidationMode ?? 'DISABLED';

    if (mode === 'DISABLED' || !deviceId) return { unknown: false };

    const device = await this.prisma.registeredDevice.findFirst({
      where: { employeeId, deviceFingerprint: deviceId, isActive: true },
    });

    if (!device) return { unknown: true };

    await this.prisma.registeredDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date() },
    });

    return { unknown: false };
  }
}
