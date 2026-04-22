import * as functions from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

/**
 * Exchanges a PingID OIDC ID token for a Firebase custom auth token.
 * Mobile and web clients call this after completing the PingID OIDC flow.
 *
 * The client must send: { idToken: string }
 * Returns: { customToken: string }
 */
export const exchangePingIdToken = functions.https.onCall(async (request) => {
  const { idToken } = request.data as { idToken: string };

  if (!idToken) {
    throw new functions.https.HttpsError('invalid-argument', 'idToken is required');
  }

  const pingIssuer = process.env.PINGID_ISSUER_URL;
  const pingClientId = process.env.PINGID_CLIENT_ID;

  if (!pingIssuer || !pingClientId) {
    throw new functions.https.HttpsError('internal', 'PingID configuration missing');
  }

  // Validate the PingID token by fetching the OIDC userinfo endpoint
  const userInfoUrl = `${pingIssuer}/idp/userinfo.openid`;
  const response = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid PingID token');
  }

  const claims = await response.json() as {
    sub: string;
    email?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };

  const uid = `pingid:${claims.sub}`;

  // Mint Firebase custom token
  const customToken = await getAuth().createCustomToken(uid, {
    email: claims.email,
    name: claims.name ?? `${claims.given_name} ${claims.family_name}`.trim(),
    provider: 'pingid',
  });

  return { customToken };
});
