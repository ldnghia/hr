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
   * ⚠️ Next.js 16: KHÔNG còn experimental.turbo
   * → Không config ở đây nữa
   */

  /**
   * Force Webpack (giữ để tránh Turbopack fallback)
   */
  webpack: (config) => {
    return config;
  },

  /**
   * Allow LAN + custom domain
   */
  allowedDevOrigins: [
    ...lanIPs.flatMap((ip) => [`${ip}:3000`, ip]),
    ...DEV_DOMAINS.flatMap((d) => [`${d}:3000`, d]),
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