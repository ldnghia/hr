import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Days credited per month for each active employee (1.0 = 12 days/year). */
const MONTHLY_ACCRUAL_DAYS = 1.0;

const EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  department: { select: { id: true, name: true } },
};

@Injectable()
export class LeaveBalanceService {
  private readonly logger = new Logger(LeaveBalanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  async getBalance(employeeId: number) {
    return this.prisma.leaveBalance.findUnique({
      where: { employeeId },
      include: { employee: { select: EMPLOYEE_SELECT } },
    });
  }

  async getAllBalances() {
    return this.prisma.leaveBalance.findMany({
      include: { employee: { select: EMPLOYEE_SELECT } },
      orderBy: { employee: { fullName: 'asc' } },
    });
  }

  async getAccrualLog(employeeId: number) {
    return this.prisma.leaveAccrualLog.findMany({
      where: { employeeId },
      orderBy: { accrualDate: 'desc' },
    });
  }

  // ── Adjust (admin / HR) ───────────────────────────────────────────────────

  async setBalance(employeeId: number, total: number, reason?: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee #${employeeId} not found`);

    const existing = await this.prisma.leaveBalance.findUnique({ where: { employeeId } });
    const usedVal = existing ? Number(existing.used) : 0;
    const remaining = Math.max(0, total - usedVal);

    const balance = await this.prisma.leaveBalance.upsert({
      where: { employeeId },
      create: { employeeId, total, used: 0, remaining: total },
      update: { total, remaining },
    });

    // Log the manual adjustment as an accrual event
    const diff = total - (existing ? Number(existing.total) : 0);
    if (diff !== 0) {
      await this.prisma.leaveAccrualLog.create({
        data: {
          employeeId,
          days: diff,
          note: reason ?? 'Manual balance adjustment',
          accrualDate: new Date(),
        },
      });
    }

    return balance;
  }

  // ── Accrual ───────────────────────────────────────────────────────────────

  /**
   * Monthly cron: runs at midnight on the 1st of every month.
   * Credits MONTHLY_ACCRUAL_DAYS to every non-resigned employee.
   */
  // @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlyAccrual() {
    const now = new Date();
    const note = `Monthly accrual — ${now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`;
    const result = await this.accrueForAll(MONTHLY_ACCRUAL_DAYS, note);
    this.logger.log(`Monthly accrual complete: ${result.processed} employees credited ${MONTHLY_ACCRUAL_DAYS} day(s)`);
    return result;
  }

  /** Manual trigger — accrue for all active employees or a single one. */
  async accrueManually(days: number, note: string, employeeId?: number) {
    if (employeeId) {
      await this.accrueForOne(employeeId, days, note);
      return { processed: 1 };
    }
    return this.accrueForAll(days, note);
  }

  // ── Deduct / Refund ───────────────────────────────────────────────────────

  /**
   * Called when a leave request is fully approved.
   * Decrements `used` and `remaining`. No-op for unpaid leave.
   */
  async deduct(employeeId: number, days: number) {
    const balance = await this.prisma.leaveBalance.findUnique({ where: { employeeId } });
    if (!balance) return;

    await this.prisma.leaveBalance.update({
      where: { employeeId },
      data: {
        used:      { increment: days },
        remaining: { decrement: days },
      },
    });
  }

  /**
   * Called when an approved leave is cancelled — refunds the balance.
   */
  async refund(employeeId: number, days: number) {
    const balance = await this.prisma.leaveBalance.findUnique({ where: { employeeId } });
    if (!balance) return;

    await this.prisma.leaveBalance.update({
      where: { employeeId },
      data: {
        used:      { decrement: days },
        remaining: { increment: days },
      },
    });

    await this.prisma.leaveAccrualLog.create({
      data: {
        employeeId,
        days,
        note: 'Balance refunded — leave cancelled',
        accrualDate: new Date(),
      },
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async accrueForAll(days: number, note: string): Promise<{ processed: number }> {
    const employees = await this.prisma.employee.findMany({
      where: { status: { not: 'resigned' } },
      select: { id: true },
    });

    for (const emp of employees) {
      await this.accrueForOne(emp.id, days, note);
    }

    return { processed: employees.length };
  }

  private async accrueForOne(employeeId: number, days: number, note: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.leaveBalance.upsert({
      where: { employeeId },
      create: { employeeId, total: days, used: 0, remaining: days },
      update: {
        total:     { increment: days },
        remaining: { increment: days },
      },
    });

    await this.prisma.leaveAccrualLog.create({
      data: {
        employeeId,
        days,
        note,
        accrualDate: today,
      },
    });
  }
}
