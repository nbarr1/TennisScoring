import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@tennis/shared', '@tennis/firebase-client'],
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

export default config;
