import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import {
  getAccessLevel,
  isAllowedWhileLocked,
  accessLockMessage,
} from '@/lib/accessLocks';

/**
 * Account lockout enforcement, for the whole app, in one place.
 *
 * Per-route guards were the old approach and they leaked: a route added after
 * the guard list was written simply had no guard, so every new feature shipped
 * unlocked for accounts the admin had barred from everything else.
 *
 * This blocks by request METHOD rather than by naming features, so it covers
 * routes that do not exist yet:
 *
 *   interact — anything that is not a GET/HEAD is refused, except a short
 *              allowlist of personal bookkeeping (see lib/accessLocks).
 *   full     — every page redirects to /locked and every API call is refused.
 *
 * The per-feature guards in the route handlers stay. They give better,
 * feature-specific messages, and defence in depth is worth the duplication for
 * the one thing in the app with an adversarial user in the threat model.
 *
 * Proxy runs on the Node.js runtime by default in Next 16, which is what lets
 * this read the database at all.
 */

/** Pages a locked-out account must still be able to reach. */
const ALWAYS_ALLOWED_PAGES = ['/locked', '/auth'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api');

  // Auth endpoints must always work, or a locked user could neither sign out
  // nor have their session refreshed when the lock lifts.
  if (pathname.startsWith('/api/auth')) return NextResponse.next();
  if (!isApi && ALWAYS_ALLOWED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const playerId = token?.playerId ? String(token.playerId) : null;
  if (!playerId) return NextResponse.next(); // signed out — normal auth handles it

  let access;
  try {
    access = await getAccessLevel(playerId);
  } catch {
    // Never let a lookup failure lock the whole crew out of their own app.
    return NextResponse.next();
  }
  if (!access) return NextResponse.next();

  const message = accessLockMessage(access);

  if (access.level === 'full') {
    if (isApi) {
      return NextResponse.json({ error: message, lockedOut: 'full' }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/locked';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // interact: reading is fine, writing is not.
  const isRead = request.method === 'GET' || request.method === 'HEAD';
  if (isRead || isAllowedWhileLocked(pathname)) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: message, lockedOut: 'interact' }, { status: 403 });
  }
  // A non-GET to a page route is a Server Action. Refusing it outright would
  // surface as an opaque framework error, so send them to the explainer.
  const url = request.nextUrl.clone();
  url.pathname = '/locked';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except static assets and image optimisation. Without the
   * negative match this would run for every CSS file and icon, which costs an
   * invocation each and can break asset loading outright.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)'],
};
