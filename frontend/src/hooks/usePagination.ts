'use client';

import { useCallback, useState } from 'react';

export function usePagination(initialLimit = 20) {
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(initialLimit);

  // Stable references — safe to include in useCallback/useEffect dep arrays.
  const goTo    = useCallback((p: number) => setPage(p), []);
  const next    = useCallback(() => setPage((p) => p + 1), []);
  const prev    = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const reset   = useCallback(() => setPage(1), []);
  const setLimit = useCallback((l: number) => { setLimitState(l); setPage(1); }, []);

  return { page, limit, goTo, next, prev, reset, setLimit };
}
