'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleSSOLogin() {
    setLoading(true);
    // Redirect to PingID OIDC authorization endpoint
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NEXT_PUBLIC_PINGID_CLIENT_ID ?? '',
      redirect_uri: `${window.location.origin}/api/auth/callback`,
      scope: 'openid profile email',
      state: crypto.randomUUID(),
    });
    window.location.href = `${process.env.NEXT_PUBLIC_PINGID_ISSUER_URL}/as/authorization.oauth2?${params}`;
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.logo}>🎾</div>
        <h1 style={styles.title}>Tennis League</h1>
        <p style={styles.subtitle}>Work Tennis Scoring & Rankings</p>

        <button style={styles.button} onClick={handleSSOLogin} disabled={loading}>
          {loading ? 'Redirecting…' : 'Sign in with Company SSO'}
        </button>

        <p style={styles.footnote}>Secured by PingID</p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' },
  card: { background: 'white', borderRadius: 20, padding: 48, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 700, color: 'var(--green-dark)', marginBottom: 8 },
  subtitle: { fontSize: 16, color: 'var(--muted)', marginBottom: 40 },
  button: { width: '100%', background: 'var(--green-dark)', color: 'white', border: 'none', borderRadius: 12, padding: '16px 24px', fontSize: 17, fontWeight: 600, cursor: 'pointer' },
  footnote: { marginTop: 24, fontSize: 12, color: '#aaa' },
};
