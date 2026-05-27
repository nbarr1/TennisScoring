import { NextResponse } from 'next/server';

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
    return NextResponse.json(
      { status: 'not_ready', missing, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'ready', service: 'web', timestamp: new Date().toISOString() });
}
