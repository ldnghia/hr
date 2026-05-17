import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hhmmToMinutes } from '../shift.service';

/** Shift shape returned from Prisma (fields used here) */
export type ShiftLike = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  isCrossDay: boolean;
  graceLateMinutes: number;
  graceEarlyMinutes: number;
  breakMinutes: number;
};

/**
 * Resolves the best-matching shift for a given employee at a given timestamp.
 *
 * Resolution order:
 *  1. Monthly EmployeeShiftAssignment for (year, month)
 *  2. Employee.shiftId fallback
 *  3. First shift in DB
 *
 * If a specific shiftId is provided (user override), that shift is returned directly
 * without time-window matching.
 */
@Injectable()
export class ShiftResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch shifts assigned to an employee for the given year/month.
   *
   * For SHIFT-mode employees with a department: returns all active shifts in
   * that department ordered by startTime (pool for auto-detection).
   * Otherwise: monthly assignment → employee default shift → first shift in DB.
   */
  async getEmployeeShifts(employeeId: number, year: number, month: number): Promise<ShiftLike[]> {
    // Fetch employee to determine workingMode and departmentId
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { currentShift: true },
    });

    // SHIFT employees: return all active department shifts for auto-detection
    if (emp?.workingMode === 'SHIFT' && emp.departmentId) {
      const departmentShifts = await this.prisma.shift.findMany({
        where: { departmentId: emp.departmentId, isActive: true },
        orderBy: { startTime: 'asc' },
      });
      if (departmentShifts.length > 0) return departmentShifts as ShiftLike[];
    }

    // Non-SHIFT path: monthly assignment first
    const assignments = await this.prisma.employeeShiftAssignment.findMany({
      where: { employeeId, year, month },
      include: { shift: true },
    });

    if (assignments.length > 0) {
      return assignments.map((a) => a.shift as ShiftLike);
    }

    // Fallback: employee's default shift
    if (emp?.currentShift) {
      return [emp.currentShift as ShiftLike];
    }

    // Final fallback: first shift in DB
    const first = await this.prisma.shift.findFirst({ orderBy: { id: 'asc' } });
    return first ? [first as ShiftLike] : [];
  }

  /**
   * Resolve the best-matching shift for (employeeId, checkinTime).
   *
   * @param employeeId  Employee
   * @param ts          Timestamp to match against shift windows
   * @param shiftIdOverride  If provided, skip window matching and return this shift directly
   */
  async resolveTargetShift(
    employeeId: number,
    ts: Date,
    shiftIdOverride?: number,
  ): Promise<ShiftLike> {
    const year = ts.getFullYear();
    const month = ts.getMonth() + 1;

    // If caller provides explicit shiftId, load it directly
    if (shiftIdOverride) {
      const shift = await this.prisma.shift.findUnique({ where: { id: shiftIdOverride } });
      if (!shift) throw new BadRequestException(`Shift #${shiftIdOverride} not found`);
      return shift as ShiftLike;
    }

    const shifts = await this.getEmployeeShifts(employeeId, year, month);

    if (shifts.length === 0) {
      throw new BadRequestException('No shift assigned for this employee');
    }

    if (shifts.length === 1) return shifts[0];

    return this.pickBestShift(shifts, ts);
  }

  /**
   * Find the shift whose time window best matches the given timestamp.
   * Prefers shifts where ts falls within [start - graceLate, end + graceEarly].
   * If none matches, picks the one with the smallest start-time distance.
   */
  private pickBestShift(shifts: ShiftLike[], ts: Date): ShiftLike {
    const currentMin = ts.getHours() * 60 + ts.getMinutes();

    // Filter shifts where ts is within the [start-graceLate .. end+graceEarly] window
    const matches = shifts.filter((s) => {
      const start = hhmmToMinutes(s.startTime) - s.graceLateMinutes;
      let end = hhmmToMinutes(s.endTime) + s.graceEarlyMinutes;
      if (s.isCrossDay && end < start) end += 1440;

      let cur = currentMin;
      // For cross-day shifts where ts is in early hours, normalize by adding 1440
      if (s.isCrossDay && cur < hhmmToMinutes(s.startTime)) cur += 1440;

      return cur >= start && cur <= end;
    });

    const pool = matches.length > 0 ? matches : shifts;

    // Among matching (or all) shifts, pick the one with startTime closest to ts
    return pool.reduce((best, s) => {
      const d1 = Math.abs(hhmmToMinutes(best.startTime) - currentMin);
      const d2 = Math.abs(hhmmToMinutes(s.startTime) - currentMin);
      return d2 < d1 ? s : best;
    });
  }
}
