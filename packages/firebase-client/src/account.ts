import { sendEmailVerification } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './config';

export async function deleteAccountCallable(): Promise<{ success: boolean }> {
  const callable = httpsCallable<Record<string, never>, { success: boolean }>(functions, 'deleteAccount');
  const result = await callable({});
  return result.data;
}

/** Sends the signed-in account a link that verifies its email address. */
export async function sendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before requesting a verification email.');
  await sendEmailVerification(user);
}

/**
 * Re-reads the signed-in account after the user follows the verification link,
 * and resolves whether the address is now verified. When it is, forces a new ID
 * token: the rules read `email_verified` from the token, and the old one still
 * says false. The refresh also updates `useAuthUser().emailVerified`.
 */
export async function refreshEmailVerification(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}
