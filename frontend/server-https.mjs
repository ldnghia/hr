/**
 * server-https.mjs
 *
 * Custom HTTPS development server for Next.js.
 * Wraps the Next.js request handler in a Node.js TLS server so that
 * geolocation (and other Secure Context APIs) work on real mobile devices.
 *
 * Prerequisites:
 *   1. Run `npm run certs` to generate certificates/hr.dcorp.com.vn.pem and
 *      certificates/hr.dcorp.com.vn-key.pem via mkcert.
 *   2. Map hr.dcorp.com.vn → 127.0.0.1 in /etc/hosts (Mac/Linux) or the Windows
 *      hosts file. On mobile, use a custom DNS entry pointing to this
 *      machine's LAN IP.
 *   3. On Android/iOS, install the mkcert CA root certificate so the browser
 *      trusts the self-signed cert (see scripts/gen-cert.sh for instructions).
 *
 * Usage:
 *   npm run dev:https            # starts this server
 *
 * Environment variables:
 *   PORT                (default: 3000)
 *   NODE_ENV            (default: development)
 *   BACKEND_INTERNAL_URL  (default: http://localhost:3001)
 */

import { createServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'node:url';
import { networkInterfaces } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────

const PORT     = parseInt(process.env.PORT ?? '3000', 10);
const HOSTNAME = '0.0.0.0';   // bind to all interfaces so mobile devices can reach us
const DOMAIN   = 'hr.dcorp.com.vn';
const dev      = process.env.NODE_ENV !== 'production';

const CERT_DIR  = resolve(__dirname, 'certificates');
const CERT_FILE = resolve(CERT_DIR, `${DOMAIN}.pem`);
const KEY_FILE  = resolve(CERT_DIR, `${DOMAIN}-key.pem`);

// ── Guard: certs must exist ──────────────────────────────────────────────────

if (!existsSync(CERT_FILE) || !existsSync(KEY_FILE)) {
  console.error('\n  ✗ TLS certificates not found.\n');
  console.error(`    Expected:\n      ${CERT_FILE}\n      ${KEY_FILE}\n`);
  console.error('  Run  npm run certs  to generate them, then retry.\n');
  process.exit(1);
}

// ── Next.js app ──────────────────────────────────────────────────────────────

//const app    = next({ dev, hostname: HOSTNAME, port: PORT });
const app = next({
  dev,
  hostname: HOSTNAME,
  port: PORT,
  turbo: false
});
const handle = app.getRequestHandler();

await app.prepare();

// ── HTTPS server ─────────────────────────────────────────────────────────────

const httpsOptions = {
  key:  readFileSync(KEY_FILE),
  cert: readFileSync(CERT_FILE),
};

const server = createServer(httpsOptions, async (req, res) => {
  try {
    const parsedUrl = parse(req.url ?? '/', true);
    await handle(req, res, parsedUrl);
  } catch (err) {
    console.error('Unhandled request error:', err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, HOSTNAME, () => {
  const lanIP = getLanIP();

  console.log('\n  ┌─────────────────────────────────────────────┐');
  console.log('  │        Next.js HTTPS dev server ready        │');
  console.log('  └─────────────────────────────────────────────┘\n');
  console.log(`  Local:   https://localhost:${PORT}`);
  console.log(`  Domain:  https://${DOMAIN}:${PORT}`);
  if (lanIP) {
    console.log(`  Network: https://${lanIP}:${PORT}`);
    console.log(`\n  Mobile:  point ${DOMAIN} → ${lanIP} in device DNS`);
    console.log(`           then open https://${DOMAIN}:${PORT}`);
  }
  console.log('\n  GPS / geolocation is available (Secure Context ✓)\n');
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the first non-loopback IPv4 address on this machine. */
function getLanIP() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}
