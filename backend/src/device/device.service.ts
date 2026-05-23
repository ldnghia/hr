import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { ListDevicesQueryDto } from './dto/list-devices-query.dto';

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  private async getMaxDevices(): Promise<number> {
    const val = await this.systemConfig.get('device_max_per_employee');
    return val ? parseInt(val, 10) : 2;
  }

  // ─── Employee self-service ────────────────────────────────────────────────

  async registerMine(employeeId: number, dto: RegisterDeviceDto, registeredById: number) {
    const max = await this.getMaxDevices();
    const activeCount = await this.prisma.registeredDevice.count({
      where: { employeeId, isActive: true },
    });
    if (activeCount >= max) {
      throw new BadRequestException(
        `Đã đạt giới hạn ${max} thiết bị. Vui lòng vô hiệu hóa thiết bị cũ trước.`,
      );
    }

    const existing = await this.prisma.registeredDevice.findFirst({
      where: { employeeId, deviceFingerprint: dto.deviceFingerprint },
    });
    if (existing) {
      if (existing.isActive) throw new ConflictException('Thiết bị này đã được đăng ký.');
      // Reactivate soft-deleted device
      return this.prisma.registeredDevice.update({
        where: { id: existing.id },
        data: { isActive: true, deviceName: dto.deviceName, userAgent: dto.userAgent, registeredById },
      });
    }

    return this.prisma.registeredDevice.create({
      data: {
        employeeId,
        deviceFingerprint: dto.deviceFingerprint,
        deviceName: dto.deviceName,
        userAgent: dto.userAgent,
        registeredById,
      },
    });
  }

  async listMine(employeeId: number) {
    return this.prisma.registeredDevice.findMany({
      where: { employeeId },
      orderBy: { registeredAt: 'desc' },
    });
  }

  async deactivateMine(employeeId: number, deviceId: number) {
    const device = await this.prisma.registeredDevice.findFirst({
      where: { id: deviceId, employeeId },
    });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị.');
    return this.prisma.registeredDevice.update({
      where: { id: deviceId },
      data: { isActive: false },
    });
  }

  // ─── Admin / HR ───────────────────────────────────────────────────────────

  async listAll(query: ListDevicesQueryDto) {
    const { employeeId, isActive, page = 1, limit = 20 } = query;
    const where: any = {};
    if (employeeId != null) where.employeeId = employeeId;
    if (isActive != null) where.isActive = isActive;

    const [data, total] = await Promise.all([
      this.prisma.registeredDevice.findMany({
        where,
        include: {
          employee: { select: { id: true, fullName: true, code: true } },
          registeredBy: { select: { id: true, fullName: true } },
        },
        orderBy: { registeredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.registeredDevice.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async registerForEmployee(
    employeeId: number,
    dto: RegisterDeviceDto,
    registeredById: number,
  ) {
    const max = await this.getMaxDevices();
    const activeCount = await this.prisma.registeredDevice.count({
      where: { employeeId, isActive: true },
    });
    if (activeCount >= max) {
      throw new BadRequestException(
        `Nhân viên đã đạt giới hạn ${max} thiết bị.`,
      );
    }

    const existing = await this.prisma.registeredDevice.findFirst({
      where: { employeeId, deviceFingerprint: dto.deviceFingerprint },
    });
    if (existing) {
      if (existing.isActive) throw new ConflictException('Thiết bị này đã được đăng ký.');
      return this.prisma.registeredDevice.update({
        where: { id: existing.id },
        data: { isActive: true, deviceName: dto.deviceName, userAgent: dto.userAgent, registeredById },
      });
    }

    return this.prisma.registeredDevice.create({
      data: { employeeId, deviceFingerprint: dto.deviceFingerprint, deviceName: dto.deviceName, userAgent: dto.userAgent, registeredById },
    });
  }

  async updateDevice(deviceId: number, dto: UpdateDeviceDto) {
    const device = await this.prisma.registeredDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị.');
    return this.prisma.registeredDevice.update({ where: { id: deviceId }, data: dto });
  }

  async deactivateDevice(deviceId: number) {
    const device = await this.prisma.registeredDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị.');
    return this.prisma.registeredDevice.update({ where: { id: deviceId }, data: { isActive: false } });
  }
}
