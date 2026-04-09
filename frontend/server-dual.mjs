/**
 * server-dual.mjs
 * 
 * Starts a single Next.js instance that listens on BOTH:
 *  - HTTP:  3000 (standard, fast)
 *  - HTTPS: 3443 (secure, for geolocation/mobile)
 */

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'node:url';
import { resolve } from 'node:path';
import next from 'next';

const dev     = process.env.NODE_ENV !== 'production';
const HTTP_PORT  = 3000;
const HTTPS_PORT = 3443;
const DOMAIN     = 'hr.dcorp.com.vn';

// Disable telemetry + force webpack to avoid certain Rust panics on older CPUs
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.NEXT_FORCE_WEBPACK = '1';

const app    = next({ dev, hostname: '0.0.0.0', port: HTTP_PORT, turbo: false });
const handle = app.getRequestHandler();

const CERT_DIR  = resolve('certificates');
const CERT_FILE = resolve(CERT_DIR, `${DOMAIN}.pem`);
const KEY_FILE  = resolve(CERT_DIR, `${DOMAIN}-key.pem`);

// ── Prepare HTTPS options ───────────────────────────────────────────────────
let httpsOptions = null;
if (existsSync(CERT_FILE) && existsSync(KEY_FILE)) {
  httpsOptions = {
    key:  readFileSync(KEY_FILE),
    cert: readFileSync(CERT_FILE),
  };
}

app.prepare().then(() => {
  // ── 1. HTTP Server (Port 3000) ──────────────────────────────────────────
  createHttpServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n  🚀 HTTP Dev:  http://localhost:${HTTP_PORT}`);
  });

  // ── 2. HTTPS Server (Port 3443) ─────────────────────────────────────────
  if (httpsOptions) {
    createHttpsServer(httpsOptions, (req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    }).listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`  🔒 HTTPS Dev: https://hr.dcorp.com.vn:${HTTPS_PORT}`);
      console.log(`              https://localhost:${HTTPS_PORT}\n`);
    });
  } else {
    console.warn('\n  ⚠ HTTPS not started: Certificates not found in ./certificates/\n');
  }
});
