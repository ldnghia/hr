'use client';

import { useState, useCallback, useEffect } from 'react';
import { attendanceService } from '@/services/attendance.service';
import type { AttendanceSession } from '@/types';

export interface UseUnclosedSessionsResult {
  unclosed: AttendanceSession[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/** Fetches sessions from previous days that have no checkoutTime. */
export function useUnclosedSessions(): UseUnclosedSessionsResult {
  const [unclosed, setUnclosed] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await attendanceService.unclosedSessions();
      setUnclosed(data);
    } catch {
      // non-critical: swallow error, show nothing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { unclosed, loading, refetch };
}
