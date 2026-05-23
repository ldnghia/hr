import { hhmmToMinutes } from '../shift.service';
import { ShiftLike } from './shift-resolver';

/** Round milliseconds → hours with 2 decimal precision */
export function toHours(ms: number): number {
  return parseFloat((ms / 1000 / 60 / 60).toFixed(2));
}

/**
 * Compute net working hours for a shift session.
 * Subtracts breakMinutes to get net hours.
 * Returns 0 if checkinTime or checkoutTime is missing.
 */
export function computeSessionHours(
  checkinTime: Date,
  checkoutTime: Date,
  shift?: ShiftLike | null,
): number {
  const rawMs = checkoutTime.getTime() - checkinTime.getTime();
  const rawHours = toHours(rawMs);
  const breakHours = shift ? shift.breakMinutes / 60 : 0;
  return Math.max(0, parseFloat((rawHours - breakHours).toFixed(2)));
}

/** Vietnam timezone offset in milliseconds (UTC+7, fixed — no DST) */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Determine the session calendar date for a check-in timestamp.
 *
 * Uses VN local time (UTC+7) to extract the calendar date, so early-morning
 * check-ins (e.g. 06:46 VN = 23:46 UTC previous day) are attributed to the
 * correct local date rather than the UTC date.
 */
export function computeSessionDate(ts: Date): Date {
  const vnTs = new Date(ts.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vnTs.getUTCFullYear(), vnTs.getUTCMonth(), vnTs.getUTCDate()));
}

/**
 * Compute WFM status flags (isLate, isEarlyOut, isOvertime) for a session.
 */
export function computeSessionFlags(
  checkinTime: Date,
  checkoutTime: Date | null,
  shift: ShiftLike,
): {
  isLate: boolean;
  isEarlyOut: boolean;
  isOvertime: boolean;
  overtimeHours: number;
  workingHours: number;
} {
  const checkinMin = checkinTime.getHours() * 60 + checkinTime.getMinutes();
  const startMin = hhmmToMinutes(shift.startTime);
  let endMin = hhmmToMinutes(shift.endTime);
  if (shift.isCrossDay && endMin <= startMin) endMin += 1440;

  // Normalize checkinMin for cross-day shifts
  const normalCheckin = shift.isCrossDay && checkinMin < startMin ? checkinMin + 1440 : checkinMin;
  const isLate = normalCheckin > startMin + shift.graceLateMinutes;

  if (!checkoutTime) {
    return { isLate, isEarlyOut: false, isOvertime: false, overtimeHours: 0, workingHours: 0 };
  }

  const workingHours = computeSessionHours(checkinTime, checkoutTime, shift);
  const normalHours = (endMin - startMin - shift.breakMinutes) / 60;
  const graceEarlyH = shift.graceEarlyMinutes / 60;

  const isEarlyOut = workingHours < normalHours - graceEarlyH;
  const isOvertime = workingHours > normalHours;
  const overtimeHours = isOvertime ? parseFloat((workingHours - normalHours).toFixed(2)) : 0;

  return { isLate, isEarlyOut, isOvertime, overtimeHours, workingHours };
}

/**
 * Build the time window [from, to] for a shift on a given date.
 * Used by the processor to bucket raw scan timestamps.
 */
export function expandShiftWindow(shift: ShiftLike, date: Date): { from: Date; to: Date } {
  const startMin = hhmmToMinutes(shift.startTime) - shift.graceLateMinutes;
  let endMin = hhmmToMinutes(shift.endTime) + shift.graceEarlyMinutes;
  if (shift.isCrossDay && endMin <= hhmmToMinutes(shift.startTime)) endMin += 1440;

  const base = date.getTime(); // already UTC midnight
  const from = new Date(base + startMin * 60_000);
  const to = new Date(base + endMin * 60_000);

  return { from, to };
}
