import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'next-firebase-auth-edge';

const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

export async function middleware(request: NextRequest) {
  try {
    return await authMiddleware(request, {
      loginPath: '/api/auth/login',
      logoutPath: '/api/auth/logout',
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
      cookieName: 'tennis-auth',
      cookieSignatureKeys: [process.env.NEXTAUTH_SECRET ?? 'fallback-dev-secret'],
      cookieSerializeOptions: {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 12 * 60 * 60 * 24 * 1000,
      },
      serviceAccount: {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? '',
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? '',
        privateKey,
      },
      handleValidToken: async () => NextResponse.next(),
      handleInvalidToken: async () => NextResponse.redirect(new URL('/login', request.url)),
      handleError: async (error) => {
        console.error('[authMiddleware] error:', error);
        if (request.nextUrl.pathname === '/api/auth/login') {
          return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
      },
    });
  } catch (err) {
    console.error('[middleware] uncaught error:', err);
    if (request.nextUrl.pathname === '/api/auth/login') {
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  // Excludes: login page, the logout endpoint, Next.js internals, and static assets.
  // /api/auth/login is intentionally NOT excluded so authMiddleware can set the session cookie.
  matcher: ['/((?!login|api/auth/logout|auth/|_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)'],
};
