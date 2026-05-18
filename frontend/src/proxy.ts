import { NextRequest, NextResponse } from 'next/server';

/**
 * Paths that do NOT require authentication.
 * Everything else is protected — unauthenticated users are sent to /login.
 */
const PUBLIC_PATHS = ['/login', '/auth/callback'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (process.env.NODE_ENV === 'development') {
    const host = req.headers.get('host') ?? 'unknown';
    if (host !== 'localhost:3000') {
      // Only log non-localhost access so the console isn't flooded during normal dev
      console.log(`[host] ${host} → ${pathname}`);
    }
  }

  // Pass through public routes
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Read the auth cookie set by token.ts#setToken()
  const token = req.cookies.get('hr_token')?.value;

  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    // Preserve the intended destination so we can redirect back after login
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals, static assets, and API proxy routes.
  // PWA files (sw.js, manifest.json, offline.html, icons/) must be public so the
  // browser can fetch them before the user is authenticated — a redirect on sw.js
  // causes "script resource is behind a redirect" and kills SW registration.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|offline\\.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)',
  ],
};
