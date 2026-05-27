import { NextResponse } from 'next/server';
import { logStructured } from '../../../lib/logger';

export async function GET() {
  const requiredEnv = [
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXTAUTH_SECRET',
    'FIREBASE_ADMIN_PROJECT_ID',
    'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY',
  ];
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logStructured('error', 'Readiness check failed due to missing environment variables', { missing });
    return NextResponse.json(
      { status: 'not_ready', timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'ready', service: 'web', timestamp: new Date().toISOString() });
}
