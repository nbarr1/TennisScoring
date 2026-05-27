import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

type CallableSuccessPayload = {
  result?: {
    userId?: string;
    createdPlaceholder?: boolean;
    linkedHistoricalMatches?: number;
  };
  error?: { message?: string; status?: string };
};

function getAdminAuth() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      }),
    });
  }
  return getAuth();
}

async function parseUpstreamPayload(response: Response): Promise<{ json: CallableSuccessPayload; rawText: string }> {
  const rawText = await response.text();
  let json: CallableSuccessPayload = {};

  try {
    if (rawText) {
      json = JSON.parse(rawText) as CallableSuccessPayload;
    }
  } catch {
    // Keep rawText intact even when upstream JSON is invalid.
  }

  return { json, rawText };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json({ error: 'Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.', requestId }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!bearerToken) {
      return NextResponse.json({ error: 'Missing bearer token.', requestId }, { status: 401 });
    }

    try {
      await getAdminAuth().verifyIdToken(bearerToken);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired bearer token.', requestId }, { status: 401 });
    }

    const body = (await request.json().catch(() => undefined)) as
      | { divisionId?: string; name?: string; email?: string; sendInvite?: boolean }
      | undefined;

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON request body.', requestId }, { status: 400 });
    }

    const region = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1';
    const callableUrl = `https://${region}-${projectId}.cloudfunctions.net/addDivisionMemberPlaceholder`;
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), 20000);

    const callableResponse = await fetch(callableUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ data: body }),
      cache: 'no-store',
      signal: timeoutController.signal,
    }).finally(() => clearTimeout(timeoutHandle));

    const { json: callablePayload, rawText } = await parseUpstreamPayload(callableResponse);

    if (!callableResponse.ok || !callablePayload.result?.userId) {
      return NextResponse.json(
        {
          error: callablePayload?.error?.message ?? 'Cloud Function call failed.',
          requestId,
          ...(process.env.NODE_ENV !== 'production' ? { upstreamStatus: callableResponse.status, upstreamBodyPreview: rawText.slice(0, 300) } : {}),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(callablePayload.result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error calling Cloud Function.',
        requestId,
      },
      { status: 500 },
    );
  }
}
