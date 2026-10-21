'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isPublicPath } from '../../lib/publicPaths';

// Loaded on demand, so the root layout itself imports no Firebase code: a
// static import here would put the whole client SDK (Firestore, Functions,
// Storage, Messaging) into every page's bundle, the privacy policy included.
const FcmProvider = dynamic(() => import('../FcmProvider').then((mod) => mod.FcmProvider), { ssr: false });
const EmailVerificationGate = dynamic(
  () => import('./EmailVerificationGate').then((mod) => mod.EmailVerificationGate),
  { ssr: false },
);

/**
 * The signed-in session's background services: push-token registration and
 * the redirect of unverified accounts to /verify-email. Neither has anything
 * to do on a public page (the gate already let those through), so they are
 * not loaded there at all.
 */
export function SessionServices(): React.JSX.Element | null {
  const pathname = usePathname();
  if (isPublicPath(pathname)) return null;
  return (
    <>
      <FcmProvider />
      <EmailVerificationGate />
    </>
  );
}
