import { NextRequest, NextResponse } from 'next/server';
import { getFunctions } from 'firebase-admin/functions';

// PingID OIDC callback — exchanges authorization code for tokens, then mints Firebase custom token
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url));
  }

  try {
    const issuer = process.env.PINGID_ISSUER_URL!;
    const clientId = process.env.PINGID_CLIENT_ID!;
    const clientSecret = process.env.PINGID_CLIENT_SECRET!;
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch(`${issuer}/as/token.oauth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL('/login?error=token_exchange', request.url));
    }

    const tokens = await tokenRes.json() as { id_token: string; access_token: string };

    // Call Firebase Cloud Function to exchange PingID ID token for Firebase custom token
    const fnRes = await fetch(
      `https://${process.env.FIREBASE_ADMIN_PROJECT_ID}-default-rtdb.firebaseio.com/`,
      // In production, call the Cloud Function URL directly
    );

    // Simplified: call the exchangePingIdToken callable via REST
    const exchangeRes = await fetch(
      `https://us-central1-${process.env.FIREBASE_ADMIN_PROJECT_ID}.cloudfunctions.net/exchangePingIdToken`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { idToken: tokens.id_token } }),
      }
    );

    if (!exchangeRes.ok) {
      return NextResponse.redirect(new URL('/login?error=firebase_exchange', request.url));
    }

    const { result } = await exchangeRes.json() as { result: { customToken: string } };

    // Return custom token to the client so it can call signInWithCustomToken
    const response = NextResponse.redirect(new URL(`/auth/complete?token=${result.customToken}`, request.url));
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login?error=unknown', request.url));
  }
}
