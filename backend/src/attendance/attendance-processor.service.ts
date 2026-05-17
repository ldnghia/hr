import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftResolverService, ShiftLike } from './helpers/shift-resolver';
import { expandShiftWindow, computeSessionHours } from './helpers/session-hours';

/** Round to 2 decimal places */
function toHours(ms: number): number {
  return parseFloat((ms / 1000 / 60 / 60).toFixed(2));
}

/** Return midnight UTC of a given date */
function toDateOnly(ts: Date): Date {
  return new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));
}

@Injectable()
export class AttendanceProcessorService {
  private readonly logger = new Logger(AttendanceProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
  ) {}

  // ─── Cron: every day at 01:00 (server timezone) ──────────────────────────

  @Cron('0 1 * * *', { name: 'process-attendance' })
  async runDailyJob(): Promise<void> {
    this.logger.log('Daily attendance processing started');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = await this.processDate(toDateOnly(yesterday));
    this.logger.log(
      `Done — ${result.processed} records upserted, ${result.skipped} employees skipped`,
    );
  }

  // ─── Core: process one calendar date ─────────────────────────────────────

  /**
   * Reads all AttendanceRaw rows for the given date, resolves codes → IDs,
   * groups timestamps by employee, then buckets per shift window before upserting.
   * One Attendance row is created per (employee, date, shift) bucket.
   */
  async processDate(date: Date): Promise<{ processed: number; skipped: number }> {
    const dayStart = toDateOnly(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const rawRows = await this.prisma.attendanceRaw.findMany({
      where: { timestamp: { gte: dayStart, lte: dayEnd } },
      orderBy: { timestamp: 'asc' },
    });

    if (rawRows.length === 0) return { processed: 0, skipped: 0 };

    // Resolve employee codes → IDs in one query
    const codes = [...new Set(
      rawRows.map((r) => r.employeeCode).filter((c): c is string => !!c),
    )];

    const employees = await this.prisma.employee.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });

    const codeToId = new Map(employees.map((e) => [e.code as string, e.id]));

    // Group all timestamps by employee ID
    const grouped = new Map<number, Date[]>();
    let skipped = 0;

    for (const row of rawRows) {
      if (!row.employeeCode || !row.timestamp) continue;
      const empId = codeToId.get(row.employeeCode);
      if (!empId) { skipped++; continue; }

      const list = grouped.get(empId) ?? [];
      list.push(row.timestamp);
      grouped.set(empId, list);
    }

    let processed = 0;

    for (const [employeeId, timestamps] of grouped) {
      const count = await this.processEmployeeScans(employeeId, dayStart, timestamps);
      processed += count;
    }

    return { processed, skipped };
  }

  /**
   * Bucket raw scan timestamps for one employee into per-shift windows,
   * then upsert one Attendance row per bucket.
   *
   * @returns number of Attendance rows upserted
   */
  async processEmployeeScans(employeeId: number, date: Date, scans: Date[]): Promise<number> {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // Fetch shifts for this employee's month
    const shifts = await this.shiftResolver.getEmployeeShifts(employeeId, year, month);

    if (shifts.length === 0) {
      this.logger.warn(`No shift found for employee ${employeeId} on ${date.toISOString().split('T')[0]}`);
      return 0;
    }

    let upserted = 0;

    for (const shift of shifts) {
      const bucket = this.bucketScans(scans, shift, date);
      if (bucket.length === 0) continue;

      const sorted = [...bucket].sort((a, b) => a.getTime() - b.getTime());
      const checkinTime = sorted[0];
      const checkoutTime = sorted.length > 1 ? sorted[sorted.length - 1] : null;
      const workingHours = checkoutTime
        ? computeSessionHours(checkinTime, checkoutTime, shift)
        : 0;

      await this.prisma.attendance.upsert({
        where: { employeeId_date_shiftId: { employeeId, date, shiftId: shift.id } },
        update: { checkinTime, checkoutTime, workingHours },
        create: { employeeId, date, shiftId: shift.id, checkinTime, checkoutTime, workingHours },
      });

      upserted++;
    }

    // Fallback: if no shift window matched any scan, create a single row using the
    // first shift and all scans (min/max) to avoid data loss.
    if (upserted === 0) {
      const sorted = [...scans].sort((a, b) => a.getTime() - b.getTime());
      const checkinTime = sorted[0];
      const checkoutTime = sorted.length > 1 ? sorted[sorted.length - 1] : null;
      const fallbackShift = shifts[0];
      const workingHours = checkoutTime ? computeSessionHours(checkinTime, checkoutTime, fallbackShift) : 0;

      await this.prisma.attendance.upsert({
        where: { employeeId_date_shiftId: { employeeId, date, shiftId: fallbackShift.id } },
        update: { checkinTime, checkoutTime, workingHours },
        create: { employeeId, date, shiftId: fallbackShift.id, checkinTime, checkoutTime, workingHours },
      });

      upserted++;
    }

    return upserted;
  }

  /**
   * Filter scans that fall within a shift's time window (expanded by grace periods).
   * A scan may fall into multiple overlapping shift windows — that is intentional;
   * HR can correct via correction requests.
   */
  private bucketScans(scans: Date[], shift: ShiftLike, date: Date): Date[] {
    const { from, to } = expandShiftWindow(shift, date);
    return scans.filter((t) => t >= from && t <= to);
  }

  /** Process multiple distinct dates — called after a bulk import. */
  async processDates(dates: Date[]): Promise<{ processed: number; skipped: number }> {
    const unique = [...new Set(dates.map((d) => toDateOnly(d).getTime()))].map(
      (t) => new Date(t),
    );
    let processed = 0;
    let skipped = 0;
    for (const d of unique) {
      const r = await this.processDate(d);
      processed += r.processed;
      skipped += r.skipped;
    }
    return { processed, skipped };
  }
}
