'use client';
import { useEffect, useRef } from 'react';

const POLL_MS = 60_000;

/** Polls /version.json every 60s and reloads the page when buildId changes. */
export function useVersionCheck() {
  const currentBuildId = useRef<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = await res.json() as { buildId: string };
        if (!currentBuildId.current) { currentBuildId.current = buildId; return; }
        if (buildId !== currentBuildId.current) window.location.reload();
      } catch { /* bỏ qua lỗi mạng */ }
    };

    const intervalId = setInterval(check, POLL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    check();

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
