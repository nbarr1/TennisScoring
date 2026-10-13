import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Rejects a signed-in caller whose email address is not verified.
 *
 * Sign-up is limited to the company domain, but a password sign-up alone does
 * not prove the person owns the address, so anyone could register a
 * colleague's address first. The Firestore, Storage, and Realtime Database
 * rules require `email_verified` for the same reason; this is the callables'
 * half. A missing `auth` is left to each callable's own unauthenticated check.
 */
export function assertVerifiedEmail(auth: { token: { email_verified?: boolean } } | undefined): void {
  if (auth && auth.token.email_verified !== true) {
    throw new HttpsError(
      'permission-denied',
      'Verify your email address before continuing. Check your inbox for the verification link.',
    );
  }
}
