'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@tennis/firebase-client';

export default function AuthCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      router.replace('/login?error=no_token');
      return;
    }
    signInWithCustomToken(auth, token)
      .then(() => router.replace('/dashboard'))
      .catch(() => router.replace('/login?error=sign_in_failed'));
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p>Completing sign in…</p>
    </div>
  );
}
