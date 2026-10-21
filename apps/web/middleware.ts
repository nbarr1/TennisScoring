import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'next-firebase-auth-edge';
import { logStructured } from './lib/logger';
import { DEFAULT_NEXT_PATH, safeNextPath } from './lib/safeNextPath';

const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

/**
 * Sends a signed-out page request to /login, carrying where it was going in
 * `next` so the player lands on the match or proposal they opened (a push
 * notification link, say) instead of the dashboard. Only page navigations
 * carry it: API routes answer with JSON before this is reached, and a
 * background request has no destination worth returning to. The login page
 * validates `next` again with the same helper before following it.
 */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);
  if (request.method === 'GET' || request.method === 'HEAD') {
    const search = new URLSearchParams(request.nextUrl.search);
    // The router's internal cache-busting parameter is not part of the page.
    search.delete('_rsc');
    const query = search.toString();
    const destination = `${request.nextUrl.pathname}${query ? `?${query}` : ''}`;
    const next = safeNextPath(destination, '');
    if (next && next !== '/' && next !== DEFAULT_NEXT_PATH) loginUrl.searchParams.set('next', next);
  }
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const cookieSecret = process.env.NEXTAUTH_SECRET;

  if (!cookieSecret) {
    logStructured('error', 'NEXTAUTH_SECRET missing for middleware request', {
      route: request.nextUrl.pathname,
      requestId: request.headers.get('x-request-id') ?? null,
    });

    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
    }

    return redirectToLogin(request);
  }

  try {
    return await authMiddleware(request, {
      loginPath: '/api/auth/login',
      logoutPath: '/api/auth/logout',
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
      cookieName: 'tennis-auth',
      cookieSignatureKeys: [cookieSecret],
      cookieSerializeOptions: {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 12 * 24 * 60 * 60,
      },
      serviceAccount: {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? '',
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? '',
        privateKey,
      },
      handleValidToken: async () => NextResponse.next(),
      handleInvalidToken: async () => {
        if (request.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return redirectToLogin(request);
      },
      handleError: async (error) => {
        logStructured('error', 'authMiddleware error', {
          route: request.nextUrl.pathname,
          requestId: request.headers.get('x-request-id') ?? null,
          error,
        });
        if (request.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
        }
        return redirectToLogin(request);
      },
    });
  } catch (err) {
    logStructured('error', 'middleware uncaught error', {
      route: request.nextUrl.pathname,
      requestId: request.headers.get('x-request-id') ?? null,
      error: err,
    });
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
    }
    return redirectToLogin(request);
  }
}

export const config = {
  // robots.txt and sitemap.xml must stay public: they are crawler entry points,
  // and gating them behind auth makes every crawler follow a 307 to /login instead
  // of reading them. Any future public-facing route belongs in this list too.
  matcher: ['/((?!login|invite/|privacy|robots\\.txt|sitemap\\.xml|api/health|api/readiness|api/functions/|api/auth/logout|auth/|_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)'],
};
