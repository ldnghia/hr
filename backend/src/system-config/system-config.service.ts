import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Seed default configs
    const defaults = [
      { key: 'telegram_bot_token', value: '', description: 'Telegram Bot API Token' },
      { key: 'telegram_reminder_time', value: '07:45', description: 'Daily late reminder time (HH:mm)' },
      { key: 'telegram_reminder_message', value: "Please don't forget to Clock-in on time!", description: 'Late reminder message' },
      { key: 'attendance_correction_monthly_limit', value: '3', description: 'Max attendance correction requests per employee per month' },
    ];

    for (const d of defaults) {
      const existing = await this.prisma.systemConfig.findUnique({ where: { key: d.key } });
      if (!existing) {
        await this.prisma.systemConfig.create({ data: d });
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { key } });
    return cfg?.value ?? null;
  }

  async set(key: string, value: string) {
    return this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  async getAll() {
    return this.prisma.systemConfig.findMany();
  }
}
