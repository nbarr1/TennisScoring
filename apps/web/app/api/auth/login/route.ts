import { NextRequest, NextResponse } from 'next/server';

// This route is intentionally included in the middleware matcher so that
// authMiddleware (next-firebase-auth-edge) intercepts POST requests here
// and sets the session cookie from the Authorization: Bearer <idToken> header.
//
// If the middleware processes the request first, this handler is never reached.
// If it is reached (e.g. during local dev without full middleware), return 401.
export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
