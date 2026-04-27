/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['@tennis/shared', '@tennis/firebase-client'],
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
  async rewrites() {
    return [
      {
        source: '/firebase-messaging-sw.js',
        destination: '/api/firebase-messaging-sw',
      },
    ];
  },
};

export default config;
