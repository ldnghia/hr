/**
 * https-proxy.mjs
 * 
 * A tiny HTTPS -> HTTP proxy to avoid Next.js CLI protocol conflicts.
 * Allows running HTTP (Standard) and HTTPS (Secure) simultaneously.
 * Port: 3443 (HTTPS) -> 3000 (HTTP)
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';

const PORT   = 3443;
const TARGET = 3000;
const DOMAIN = 'hr.dcorp.com.vn';

const CERT_DIR = resolve('certificates');
const KEY_FILE = resolve(CERT_DIR, `${DOMAIN}-key.pem`);
const CERT_FILE = resolve(CERT_DIR, `${DOMAIN}.pem`);

if (!fs.existsSync(KEY_FILE) || !fs.existsSync(CERT_FILE)) {
  console.error('\n  ✗ TLS certificates not found for hr.dcorp.com.vn');
  console.error('  Run  npm run certs  to generate them, then retry.\n');
  process.exit(1);
}

const httpsOptions = {
  key:  fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
};

const server = https.createServer(httpsOptions, (req, res) => {
  const proxy = http.request({
    port: TARGET,
    host: 'localhost',
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `localhost:${TARGET}` }
  }, (remoteRes) => {
    res.writeHead(remoteRes.statusCode, remoteRes.headers);
    remoteRes.pipe(res);
  });
  req.pipe(proxy);
  proxy.on('error', (e) => {
    res.statusCode = 502;
    res.end(`Proxy Error: ${e.message} (Is next dev running on port 3000?)`);
  });
});

// ── WebSocket Proxy (for HMR / Hot Refresh) ───────────────────────────────────

server.on('upgrade', (req, socket, head) => {
  const proxyReq = http.request({
    port: TARGET,
    host: 'localhost',
    method: 'GET',
    headers: req.headers
  });

  proxyReq.on('upgrade', (remoteRes, remoteSocket) => {
    socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                 'Upgrade: WebSocket\r\n' +
                 'Connection: Upgrade\r\n\r\n');
    remoteSocket.pipe(socket);
    socket.pipe(remoteSocket);
  });

  proxyReq.on('error', (e) => {
    console.error(`[WebSocket Proxy Error]: ${e.message}`);
    socket.destroy();
  });

  proxyReq.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ┌───────────────────────────────────────────────┐');
  console.log('  │          HTTPS Development Proxy Ready        │');
  console.log('  └───────────────────────────────────────────────┘\n');
  console.log(`  Target:  http://localhost:${TARGET}`);
  console.log(`  Secure:  https://hr.dcorp.com.vn:${PORT}`);
  console.log(`           https://localhost:${PORT}`);
  console.log('\n  (Enable both: run npm run dev + npm run dev:proxy in separate terminals)\n');
});
