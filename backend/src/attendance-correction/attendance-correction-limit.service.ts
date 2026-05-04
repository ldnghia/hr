import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  CORRECTION_MONTHLY_LIMIT_DEFAULT,
  CORRECTION_MONTHLY_LIMIT_KEY,
  CORRECTION_STATUS,
} from './attendance-correction.constants';

@Injectable()
export class AttendanceCorrectionLimitService {
  private cachedLimit: number | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async getLimit(): Promise<number> {
    if (this.cachedLimit !== null && Date.now() < this.cacheExpiry) {
      return this.cachedLimit;
    }
    const raw = await this.systemConfig.get(CORRECTION_MONTHLY_LIMIT_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    this.cachedLimit = isNaN(parsed) ? CORRECTION_MONTHLY_LIMIT_DEFAULT : parsed;
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
    return this.cachedLimit;
  }

  /** Throws BadRequestException if employee has reached monthly limit */
  async assertWithinLimit(employeeId: number, tx?: PrismaService): Promise<void> {
    const db = tx ?? this.prisma;
    const limit = await this.getLimit();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await db.attendanceCorrectionRequest.count({
      where: {
        employeeId,
        status: { in: [CORRECTION_STATUS.PENDING, CORRECTION_STATUS.APPROVED] },
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    if (count >= limit) {
      throw new BadRequestException(
        `Monthly correction request limit (${limit}) reached for this month`,
      );
    }
  }
}
