import { NextResponse } from 'next/server';

export async function GET() {
  const requiredEnv = ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXTAUTH_SECRET'];
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return NextResponse.json(
      { status: 'not_ready', missing, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'ready', service: 'web', timestamp: new Date().toISOString() });
}
