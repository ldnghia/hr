import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import https from 'https';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
  ) {}

  /**
   * Runs every minute to check if it's time to send the reminder.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndSendReminders() {
    const reminderTime = await this.config.get('telegram_reminder_time'); // "HH:mm"
    if (!reminderTime) return;

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (currentTime !== reminderTime) return;

    this.logger.log(`Starting Telegram check-in reminders for ${currentTime}...`);
    await this.sendCheckinReminders();
  }

  private async sendCheckinReminders() {
    const token = await this.config.get('telegram_bot_token');
    const message = await this.config.get('telegram_reminder_message') || "Please don't forget to Clock-in on time!";
    
    if (!token) {
      this.logger.warn('Telegram Bot Token is not configured. Skipping reminders.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Get all employees with a Telegram ID who are not resigned
    const employees = await this.prisma.employee.findMany({
      where: {
        AND: [
          { telegramId: { not: null } },
          { telegramId: { not: '' } }
        ],
        status: { not: 'resigned' },
      },
      select: {
        id: true,
        telegramId: true,
        fullName: true,
      }
    });

    // 2. Filter those who haven't clocked in today
    // We check the Attendance table for a record with checkinTime today
    const attendances = await this.prisma.attendance.findMany({
      where: {
        date: today,
        checkinTime: { not: null },
        deletedAt: null,
      },
      select: { employeeId: true }
    });

    const clockedInIds = new Set(attendances.map(a => a.employeeId));
    const targetEmployees = employees.filter(e => !clockedInIds.has(e.id));

    this.logger.log(`Found ${targetEmployees.length} employees who haven't clocked in yet.`);

    for (const emp of targetEmployees) {
      if (emp.telegramId) {
        await this.sendTelegramMessage(token, emp.telegramId, message);
      }
    }
  }

  private async sendTelegramMessage(token: string, chatId: string, text: string) {
    const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}`;
    
    return new Promise((resolve) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
           if (res.statusCode !== 200) {
             this.logger.error(`Telegram API Error (Status ${res.statusCode}): ${data}`);
           }
           resolve(true);
        });
      }).on('error', (err) => {
        this.logger.error(`Telegram Request Error: ${err.message}`);
        resolve(false);
      });
    });
  }
}
