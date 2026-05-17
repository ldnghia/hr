'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and handles lifecycle events:
 *
 * - On first load: registers /sw.js with scope '/'.
 * - On update found: when a new SW finishes installing (state === 'installed'),
 *   posts SKIP_WAITING so the new worker activates immediately, then reloads
 *   the page so users get the latest version without a manual refresh.
 * - controllerchange: catches the case where another tab already triggered
 *   the skip and this tab's controller changed mid-session.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let refreshing = false;

    // Reload once when the active SW changes (new version took control).
    function onControllerChange() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[SW] Registered, scope:', registration.scope);

        // Handle updates for SWs already waiting when the page loads.
        // Guard: only activate if there's an existing controller — meaning this
        // is a genuine update, not the first install (first install has no
        // controller yet and should never force a reload).
        if (registration.waiting && navigator.serviceWorker.controller) {
          activateWaiting(registration.waiting);
          return;
        }

        // Handle updates discovered after page load.
        registration.addEventListener('updatefound', () => {
          const incoming = registration.installing;
          if (!incoming) return;

          incoming.addEventListener('statechange', () => {
            // 'installed' + an existing controller means this is an update,
            // not the very first install.
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
              activateWaiting(incoming);
            }
          });
        });

        // Proactively check for updates every time the user revisits the tab.
        function checkForUpdate() {
          registration.update().catch(() => {
            // Silent failure: update checks are best-effort.
          });
        }

        window.addEventListener('focus', checkForUpdate);
        window.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}

/**
 * Tells a waiting service worker to skip waiting and take control.
 * The 'controllerchange' handler above will then reload the page.
 */
function activateWaiting(worker: ServiceWorker) {
  console.log('[SW] New version available — activating.');
  worker.postMessage({ type: 'SKIP_WAITING' });
}
