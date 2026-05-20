const STORAGE_KEY = 'hr.deviceFingerprint';

/** Generate a stable SHA-256 browser fingerprint from navigator properties. */
async function generateFingerprint(): Promise<string> {
  const raw = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(navigator.hardwareConcurrency ?? 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.platform,
  ].join('|');

  const buf = new TextEncoder().encode(raw);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Returns the device fingerprint, reading from localStorage cache first.
 * Returns empty string in SSR context.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) return cached;

  const hash = await generateFingerprint();
  localStorage.setItem(STORAGE_KEY, hash);
  return hash;
}

/** Clear cached fingerprint (e.g. after logout). */
export function clearDeviceFingerprint(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
