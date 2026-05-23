'use client';
import { useVersionCheck } from '@/hooks/use-version-check';

/** Renders nothing — just activates version polling in the background. */
export function VersionCheckProvider() {
  useVersionCheck();
  return null;
}
