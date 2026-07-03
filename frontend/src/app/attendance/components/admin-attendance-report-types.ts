/** Shared types for the admin attendance report (monthly grid + detail view) */

export type CellStatus =
  | 'ok' | 'late' | 'early' | 'ot'
  | 'annual' | 'unpaid' | 'special'
  | 'holiday' | 'absent' | 'off' | 'future';

export const STATUS_META: Record<CellStatus, { label: string; short: string }> = {
  ok:      { label: 'Đúng giờ',    short: '✓'  },
  late:    { label: 'Đi trễ',      short: '!'  },
  early:   { label: 'Về sớm',      short: '↩'  },
  annual:  { label: 'Phép năm',    short: 'P'  },
  unpaid:  { label: 'Không lương', short: 'KL' },
  special: { label: 'Nghỉ ĐB',     short: 'ĐB' },
  holiday: { label: 'Ngày lễ',     short: 'L'  },
  ot:      { label: 'Tăng ca',     short: 'OT' },
  absent:  { label: 'Vắng mặt',    short: '✗'  },
  off:     { label: 'Nghỉ tuần',   short: '·'  },
  future:  { label: 'Chưa đến',    short: '·'  },
};

/** Vietnamese public holidays (YYYY-MM-DD → name) */
export const VN_HOLIDAYS: Record<string, string> = {
  '2026-01-01': 'Tết Dương lịch',
  '2026-02-16': 'Tết Nguyên đán',
  '2026-02-17': 'Tết Nguyên đán',
  '2026-02-18': 'Tết Nguyên đán',
  '2026-02-19': 'Tết Nguyên đán',
  '2026-02-20': 'Tết Nguyên đán',
  '2026-04-25': 'Giỗ Tổ Hùng Vương',
  '2026-04-30': 'Ngày Thống nhất',
  '2026-05-01': 'Quốc tế Lao động',
  '2026-09-02': 'Quốc khánh',
  '2025-01-01': 'Tết Dương lịch',
  '2025-01-28': 'Tết Nguyên đán',
  '2025-01-29': 'Tết Nguyên đán',
  '2025-01-30': 'Tết Nguyên đán',
  '2025-01-31': 'Tết Nguyên đán',
  '2025-02-01': 'Tết Nguyên đán',
  '2025-04-07': 'Giỗ Tổ Hùng Vương',
  '2025-04-30': 'Ngày Thống nhất',
  '2025-05-01': 'Quốc tế Lao động',
  '2025-09-02': 'Quốc khánh',
};

export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface ShiftEntry {
  shiftCode: 'S' | 'C' | 'D' | '?'; // S=Sáng, C=Chiều, D=Đêm
  shiftName?: string;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  status: CellStatus;
  lateMinutes?: number;
  earlyMinutes?: number;
  otHours?: number;
  workingHours?: number;
  normalHours?: number;   // expected net hours for this shift
  hasNoCheckout?: boolean;
  attendanceId?: number;
  correctionStatus?: CorrectionStatus;
  isHalfDay?: boolean;
}

export interface DayCell {
  dateStr: string; // YYYY-MM-DD
  day: number;
  dow: number; // 0=Sun … 6=Sat
  status: CellStatus;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  lateMinutes?: number;
  earlyMinutes?: number;
  otHours?: number;
  note?: string;           // holiday name or general note
  checkinNote?: string | null;
  checkoutNote?: string | null;
  locationNote?: string | null;
  correctionReason?: string | null;   // reason from latest correction request
  correctionReviewNote?: string | null; // reviewer's note
  isHoliday?: boolean;
  holidayName?: string;
  attendanceId?: number;
  workingHours?: number;
  normalHours?: number;   // expected net hours for this shift
  hasNoCheckout?: boolean;
  correctionStatus?: CorrectionStatus;
  isCorrected?: boolean;
  isInOffice?: boolean;
  // Leave info
  leaveType?: string;
  isHalfDay?: boolean;
  /** Populated for SHIFT employees (Command Center), length >= 1 */
  shifts?: ShiftEntry[];
}

export interface EmployeeRow {
  id: number;
  code: string;
  fullName: string;
  deptName: string;
  deptId?: number;
  shiftName?: string;
  cells: DayCell[];
  totalLateMin: number;
  totalOtHours: number;
  lateDays: number;
  absentDays: number;
  otDays: number;
  okDays: number;
  annualDays: number;
}

export interface MonthlySummary {
  totalEmployees: number;
  attendanceRate: number;
  lateTotalEvents: number;
  earlyTotal: number;
  absentTotal: number;
  otTotalHours: number;
  annualTotal: number;
  okShifts: number;
  scheduledShifts: number;
}

/** Derive CellStatus from raw attendance fields */
export function deriveCellStatus(record: {
  isLate?: boolean;
  isEarlyOut?: boolean;
  isOvertime?: boolean;
  checkinTime?: string | null;
}): CellStatus {
  if (!record.checkinTime) return 'absent';
  if (record.isLate) return 'late';
  if (record.isEarlyOut) return 'early';
  if (record.isOvertime) return 'ot';
  return 'ok';
}

export function isoDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function countWorkingDays(year: number, month: number): number {
  const dim = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= dim; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    const ds = isoDateStr(year, month, d);
    if (dow !== 0 && dow !== 6 && !VN_HOLIDAYS[ds]) count++;
  }
  return count;
}

/** Format minutes → "Xp" or hours → "Xh" */
export function fmtMinutes(m: number): string {
  return m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}p`;
}

/** Derive shift code from shift name or start time */
export function deriveShiftCode(shift?: { name: string; startTime: string }): 'S' | 'C' | 'D' | '?' {
  if (!shift) return '?';
  const name = (shift.name || '').toLowerCase();
  if (name.includes('sáng') || name.includes('sang') || name.includes('morning') || name.includes('s1') || name.includes('ca s')) return 'S';
  if (name.includes('chiều') || name.includes('chieu') || name.includes('afternoon') || name.includes('ca c')) return 'C';
  if (name.includes('đêm') || name.includes('dem') || name.includes('night') || name.includes('ca d') || name.includes('ca đ')) return 'D';
  // Fallback: derive from start time
  const h = parseInt(shift.startTime.split(':')[0], 10);
  if (h >= 5 && h < 11) return 'S';
  if (h >= 11 && h < 18) return 'C';
  return 'D';
}

/** Initials from full Vietnamese name (last 2 words) */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[parts.length - 2]?.[0] ?? '';
  const b = parts[parts.length - 1]?.[0] ?? '';
  return (a + b).toUpperCase();
}

/** Deterministic gradient from employee id */
export function avatarGradient(id: number): string {
  const hue = (id * 47) % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 65% 42%))`;
}
