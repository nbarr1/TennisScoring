'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthUser } from '@tennis/firebase-client';
import { isPublicPath } from '../../lib/publicPaths';

// Pages an account with an unverified email address may stay on are the
// public paths. The invite page sends a new player to verification itself,
// after it has created the web session that the verification page needs.
// SessionServices does not mount this gate on them at all; the check here
// covers a client navigation that lands on one while it is mounted.

/**
 * Sends a signed-in account whose email address is not verified to
 * /verify-email. The security rules refuse such an account almost everything,
 * so without this every other page would only show permission errors.
 */
export function EmailVerificationGate(): null {
  const { firebaseUser, emailVerified, loading } = useAuthUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !firebaseUser || emailVerified || !pathname) return;
    if (isPublicPath(pathname)) return;
    const next = `${pathname}${window.location.search}`;
    router.replace(`/verify-email?next=${encodeURIComponent(next)}`);
  }, [loading, firebaseUser, emailVerified, pathname, router]);

  return null;
}
