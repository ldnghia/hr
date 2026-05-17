import type { NextConfig } from 'next';
import * as os from 'os';

/**
 * Returns every non-loopback IPv4 address on this machine.
 */
function getLanIPs(): string[] {
  const ips: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const lanIPs = getLanIPs();
const DEV_DOMAINS = ['hr.dcorp.com.vn'];

const nextConfig: NextConfig = {
  /**
   * Force Webpack — Turbopack requires `popcnt` CPU instruction unavailable
   * on Windows Server 2012. The webpack callback must be present; Next.js 16
   * uses its existence as a signal to skip Turbopack initialisation.
   */
  webpack: (config) => config,

  /**
   * Allow requests from LAN IPs and the custom domain on BOTH ports
   * (3000 HTTP + 3443 HTTPS). Missing port variants cause Next.js to
   * reject cross-origin dev requests with an empty response.
   */
  allowedDevOrigins: [
    'localhost',
    'localhost:3000',
    'localhost:3443',
    ...lanIPs.flatMap((ip) => [ip, `${ip}:3000`, `${ip}:3443`]),
    ...DEV_DOMAINS.flatMap((d) => [d, `${d}:3000`, `${d}:3443`]),
  ],

  /**
   * Headers config
   */
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
      {
        // PWA icons are stable — cache for 7 days in the browser.
        source: '/icons/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, immutable' },
        ],
      },
    ];
  },

  /**
   * Proxy API → backend (NestJS)
   */
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;