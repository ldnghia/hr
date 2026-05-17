'use client';

import { useState, useCallback, useEffect } from 'react';
import { attendanceService } from '@/services/attendance.service';
import type { AttendanceSession } from '@/types';

export interface UseTodaySessionsResult {
  sessions: AttendanceSession[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches GET /attendance/today → AttendanceSession[]
 * Exposes refetch so callers can refresh after checkin/checkout.
 */
export function useTodaySessions(): UseTodaySessionsResult {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await attendanceService.todaySessions();
      setSessions(data ?? []);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load today sessions';
      console.error('[useTodaySessions]', msg, err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { sessions, loading, error, refetch };
}
