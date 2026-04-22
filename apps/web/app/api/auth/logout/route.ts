import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  // Clear the auth cookie
  response.cookies.set('tennis-auth', '', { maxAge: 0, path: '/' });
  return response;
}
