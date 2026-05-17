'use client';

import { useState, useCallback, useEffect } from 'react';
import { attendanceService } from '@/services/attendance.service';
import type { MonthlyShift } from '@/types';

export interface UseCurrentMonthShiftsResult {
  shifts: MonthlyShift[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches GET /attendance/my-shifts/current-month
 * Returns the list of shifts assigned to the current employee this month.
 * Used to render N session cards even before any check-in occurs.
 */
export function useCurrentMonthShifts(): UseCurrentMonthShiftsResult {
  const [shifts, setShifts] = useState<MonthlyShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await attendanceService.myShiftsCurrentMonth();
      setShifts(data ?? []);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load shifts';
      console.error('[useCurrentMonthShifts]', msg, err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { shifts, loading, error };
}
