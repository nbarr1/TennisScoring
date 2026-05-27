const allowUnsafeEval =
  process.env.NODE_ENV !== 'production' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_ENV === 'development';

const scriptSrc = [
  "'self'",
  ...(allowUnsafeEval ? ["'unsafe-eval'"] : []),
  'https://www.gstatic.com',
  'https://vercel.live',
].join(' ');

/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['@tennis/shared', '@tennis/firebase-client'],
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
      },
      {
        source: '/firebase-messaging-sw.js',
        destination: '/api/firebase-messaging-sw',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              "style-src 'self' https://vercel.live",
              "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://vercel.live https://vercel.com",
              "font-src 'self' https://vercel.live https://assets.vercel.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://fcm.googleapis.com https://*.cloudfunctions.net https://vercel.live wss://ws-us3.pusher.com",
              "frame-src https://vercel.live",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default config;
