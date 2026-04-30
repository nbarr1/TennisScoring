import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.' },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('authorization') ?? '';
    const body = (await request.json()) as {
      divisionId?: string;
      name?: string;
      email?: string;
      sendInvite?: boolean;
    };

    const callableUrl = `https://us-central1-${projectId}.cloudfunctions.net/addDivisionMemberPlaceholder`;
    const callableResponse = await fetch(callableUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ data: body }),
      cache: 'no-store',
    });

    const callablePayload = (await callableResponse.json().catch(() => ({}))) as {
      result?: {
        userId?: string;
        createdPlaceholder?: boolean;
        linkedHistoricalMatches?: number;
      };
      error?: { message?: string };
    };

    if (!callableResponse.ok || !callablePayload.result?.userId) {
      return NextResponse.json(
        {
          error:
            callablePayload.error?.message ??
            'Cloud Function call failed.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json(callablePayload.result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected error calling Cloud Function.',
      },
      { status: 500 },
    );
  }
}
