import type { MonthlyShift } from '@/types';

/** Convert "HH:MM" to total minutes — mirrors backend hhmmToMinutes() */
function hhmmToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Client-side mirror of backend computeSessionFlags().isLate
 * (backend/src/attendance/helpers/session-hours.ts:54-65).
 * Must stay in sync with that formula — do not invent a different threshold.
 */
export function predictIsLate(now: Date, shift: MonthlyShift): boolean {
  const checkinMin = now.getHours() * 60 + now.getMinutes();
  const startMin = hhmmToMins(shift.startTime);
  const rawEndMin = hhmmToMins(shift.endTime);

  const normalCheckin = (shift.isCrossDay && checkinMin < rawEndMin) ? checkinMin + 1440 : checkinMin;
  return normalCheckin > startMin + shift.graceLateMinutes;
}

/**
 * Client-side mirror of backend computeSessionFlags().isEarlyOut
 * (backend/src/attendance/helpers/session-hours.ts:71-75).
 */
export function predictIsEarlyOut(checkinTime: Date, now: Date, shift: MonthlyShift): boolean {
  const startMin = hhmmToMins(shift.startTime);
  const rawEndMin = hhmmToMins(shift.endTime);
  const endMin = (shift.isCrossDay && rawEndMin <= startMin) ? rawEndMin + 1440 : rawEndMin;

  const rawHours = (now.getTime() - checkinTime.getTime()) / 1000 / 60 / 60;
  const workingHours = Math.max(0, rawHours - shift.breakMinutes / 60);
  const normalHours = (endMin - startMin - shift.breakMinutes) / 60;
  const graceEarlyH = shift.graceEarlyMinutes / 60;

  return workingHours < normalHours - graceEarlyH;
}
