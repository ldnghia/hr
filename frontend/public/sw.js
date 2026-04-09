/**
 * HR System — Production Service Worker
 *
 * Cache strategy overview:
 *
 *  ┌─────────────────────────────┬───────────────────────────────────────────┐
 *  │ Request type                │ Strategy                                  │
 *  ├─────────────────────────────┼───────────────────────────────────────────┤
 *  │ /api/* (all API calls)      │ Network-only → 503 JSON on failure        │
 *  │ Navigation (HTML pages)     │ Network-first → cache → offline.html      │
 *  │ _next/* (JS/CSS chunks)     │ Bypass — handled by Next.js HTTP headers  │
 *  │ Other static assets         │ Cache-first → network → cache             │
 *  └─────────────────────────────┴───────────────────────────────────────────┘
 *
 * Security rules:
 *  - API responses are NEVER cached (auth tokens, sensitive payloads)
 *  - Tokens are NEVER stored in cache storage
 *  - Only GET requests from same origin are processed
 */

// ─── Cache versioning ────────────────────────────────────────────────────────
// Bump CACHE_VERSION to force all clients to receive the new SW on next visit.

const CACHE_VERSION = 'v3';
const PRECACHE_NAME = `hr-precache-${CACHE_VERSION}`;  // shell assets, offline page
const DYNAMIC_CACHE = `hr-dynamic-${CACHE_VERSION}`;   // runtime pages / icons

const ALL_CACHES = [PRECACHE_NAME, DYNAMIC_CACHE];

// NOTE: _next/static/ chunks are intentionally NOT cached by the SW.
// Next.js already serves them with `Cache-Control: public, max-age=31536000, immutable`
// in production (content-hashed URLs). In dev (Turbopack), those URLs are NOT
// content-hashed — caching them would cause the browser to serve stale JS modules
// after every rebuild, breaking HMR and causing "module factory not available" errors.

// Assets to cache immediately on install (must be small and stable)
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// URL prefixes that must NEVER be cached (auth, API, tokens)
const NEVER_CACHE = [
  '/api/',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if this request should bypass the SW entirely.
 * Reasons: non-GET, cross-origin, or on the never-cache list.
 */
function shouldBypass(request) {
  if (request.method !== 'GET') return true;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;

  for (const prefix of NEVER_CACHE) {
    if (url.pathname.startsWith(prefix)) return true;
  }

  return false;
}

/** True when the URL belongs to Next.js internal build output — never cache these. */
function isNextInternal(url) {
  return url.pathname.startsWith('/_next/');
}

/** True for page navigations. */
function isNavigation(request) {
  return request.mode === 'navigate';
}

// ─── Install: precache shell ──────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => {
        // Take control immediately; don't wait for old SW to die.
        self.skipWaiting();
      }),
  );
});

// ─── Activate: clean up stale caches ─────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            }),
        ),
      )
      .then(() => {
        // Claim all open clients without requiring a page reload.
        return self.clients.claim();
      }),
  );
});

// ─── Message: manual skip-waiting trigger ────────────────────────────────────
// The registration component sends { type: 'SKIP_WAITING' } after detecting
// a waiting SW, then reloads the page so the user gets the new version.

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Let the browser handle non-cacheable requests normally.
  if (shouldBypass(request)) {
    // For API calls that are GET, return a structured offline error instead of
    // a browser network error, so the frontend can show a friendly message.
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        event.respondWith(
          fetch(request).catch(
            () =>
              new Response(
                JSON.stringify({ error: 'offline', message: 'No internet connection' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } },
              ),
          ),
        );
      }
    }
    return;
  }

  const url = new URL(request.url);

  // Strategy 1 — Next.js internals (_next/*): always bypass.
  // The browser HTTP cache + Next.js cache headers handle these correctly.
  // Letting the SW cache them causes stale JS in Turbopack dev (no content hash).
  if (isNextInternal(url)) return;

  // Strategy 2 — Page navigations: network-first, fallback to offline page
  if (isNavigation(request)) {
    event.respondWith(networkFirstNav(request));
    return;
  }

  // Strategy 3 — Other static assets (icons, fonts, images): cache-first
  event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
});

// ─── Strategy implementations ─────────────────────────────────────────────────

/**
 * Cache-first: serve from cache, fetch & store on miss.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Nothing useful to return for a static asset — let browser show its error.
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

/**
 * Network-first for navigations.
 * Order: live network → cached page → cached offline.html → last resort text.
 */
async function networkFirstNav(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    // Absolute last resort — shouldn't reach here if install precache succeeded.
    return new Response(
      '<!DOCTYPE html><html><body><h1>You are offline</h1><button onclick="location.reload()">Retry</button></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html' } },
    );
  }
}

// ─── IndexedDB — offline attendance scaffold ──────────────────────────────────
//
// DESIGN NOTES (not yet implemented — foundation only):
//
// When the HR system needs true offline-first attendance check-in:
//
// 1. DATABASE SETUP
//    Open an IndexedDB database named 'hr-offline' with stores:
//      - 'pending-attendance': check-in/out records queued while offline
//        keyPath: 'localId' (auto-increment)
//        indexes: ['employeeId', 'timestamp', 'syncStatus']
//      - 'attendance-cache': read-only mirror of recent server records
//        keyPath: 'id' (server ID)
//
// 2. CHECK-IN FLOW (offline)
//    a. Attempt POST /api/v1/attendance/check-in via fetch.
//    b. On network failure, write to 'pending-attendance' store with
//       syncStatus: 'pending', capturedAt: Date.now(), gpsCoords: {lat, lng}.
//    c. Register a Background Sync tag: 'sync-attendance' (if API available).
//    d. Show the user an optimistic UI confirmation.
//
// 3. BACKGROUND SYNC
//    self.addEventListener('sync', (event) => {
//      if (event.tag === 'sync-attendance') {
//        event.waitUntil(flushPendingAttendance());
//      }
//    });
//
//    async function flushPendingAttendance() {
//      const db = await openHrDb();
//      const pending = await db.getAllFromIndex('pending-attendance', 'syncStatus', 'pending');
//      for (const record of pending) {
//        try {
//          await fetch('/api/v1/attendance/check-in', {
//            method: 'POST',
//            headers: { 'Content-Type': 'application/json',
//                        'Authorization': `Bearer ${record.token}` },
//            body: JSON.stringify(record),
//          });
//          await db.put('pending-attendance', { ...record, syncStatus: 'synced' });
//        } catch {
//          // Leave as 'pending'; will retry on next sync event.
//        }
//      }
//    }
//
// 4. SECURITY NOTE
//    Store JWT in the IDB record only for the sync window (short TTL).
//    Clear synced records immediately after successful flush.
//    Do NOT store tokens in Cache Storage (this file must never call
//    cache.put() on any /api/ response).
//
// 5. CONFLICT RESOLUTION
//    Server is authoritative. If the server rejects a pending record
//    (e.g. duplicate, expired token), mark syncStatus: 'failed' and
//    notify the client via postMessage so the UI can surface the error.
//
// ─────────────────────────────────────────────────────────────────────────────
