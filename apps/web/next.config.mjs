/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['@tennis/shared', '@tennis/firebase-client'],
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

export default config;
