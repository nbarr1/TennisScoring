import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'next-firebase-auth-edge';
import { logStructured } from './lib/logger';

const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

export async function middleware(request: NextRequest) {
  const cookieSecret = process.env.NEXTAUTH_SECRET;

  if (!cookieSecret) {
    logStructured('error', 'NEXTAUTH_SECRET missing for middleware request', {
      route: request.nextUrl.pathname,
      requestId: request.headers.get('x-request-id') ?? null,
    });

    if (request.nextUrl.pathname === '/api/auth/login') {
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
    }

    return NextResponse.redirect(new URL('/login', request.url));
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
      handleInvalidToken: async () => NextResponse.redirect(new URL('/login', request.url)),
      handleError: async (error) => {
        logStructured('error', 'authMiddleware error', {
          route: request.nextUrl.pathname,
          requestId: request.headers.get('x-request-id') ?? null,
          error,
        });
        if (request.nextUrl.pathname === '/api/auth/login') {
          return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
      },
    });
  } catch (err) {
    logStructured('error', 'middleware uncaught error', {
      route: request.nextUrl.pathname,
      requestId: request.headers.get('x-request-id') ?? null,
      error: err,
    });
    if (request.nextUrl.pathname === '/api/auth/login') {
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!login|invite/|api/auth/logout|auth/|_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)'],
};
