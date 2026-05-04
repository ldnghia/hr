export const CORRECTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

export type CorrectionStatus = (typeof CORRECTION_STATUS)[keyof typeof CORRECTION_STATUS];

export const CORRECTION_MONTHLY_LIMIT_KEY = 'attendance_correction_monthly_limit';
export const CORRECTION_MONTHLY_LIMIT_DEFAULT = 3;
