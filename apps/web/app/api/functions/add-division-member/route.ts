import { NextRequest, NextResponse } from 'next/server';

type CallableSuccessPayload = {
  result?: {
    userId?: string;
    createdPlaceholder?: boolean;
    linkedHistoricalMatches?: number;
  };
  error?: { message?: string; status?: string };
};

async function parseUpstreamPayload(response: Response): Promise<{
  json: CallableSuccessPayload;
  rawText: string;
}> {
  const rawText = await response.text();
  const json = (rawText
    ? (JSON.parse(rawText) as CallableSuccessPayload)
    : {}) as CallableSuccessPayload;
  return { json, rawText };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const debugFunctionsConfig = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    region: process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION ?? null,
  };
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json(
        {
          error: 'Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.',
          requestId,
        },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('authorization') ?? '';
    const body = (await request
      .json()
      .catch(() => undefined)) as
      | {
      divisionId?: string;
      name?: string;
      email?: string;
      sendInvite?: boolean;
    }
      | undefined;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON request body.', requestId },
        { status: 400 },
      );
    }

    const region = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1';
    const callableUrl = `https://${region}-${projectId}.cloudfunctions.net/addDivisionMemberPlaceholder`;
    const debugCallableTarget = {
      ...debugFunctionsConfig,
      resolvedRegion: region,
      callableUrl,
    };
    const timeoutMs = 20000;
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
    const callableResponse = await fetch(callableUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ data: body }),
      cache: 'no-store',
      signal: timeoutController.signal,
    }).finally(() => {
      clearTimeout(timeoutHandle);
    });

    const { json: callablePayload, rawText } = await parseUpstreamPayload(
      callableResponse,
    ).catch(() => ({ json: {} as CallableSuccessPayload, rawText: '' }));

    if (!callableResponse.ok || !callablePayload.result?.userId) {
      console.error('add-division-member upstream failure', {
        requestId,
        callableUrl,
        status: callableResponse.status,
        statusText: callableResponse.statusText,
        hasAuthHeader: Boolean(authHeader),
        upstreamError: callablePayload.error?.message ?? null,
        upstreamBodyPreview: rawText.slice(0, 500),
      });
      return NextResponse.json(
        {
          error:
            callablePayload?.error?.message ??
            'Cloud Function call failed.',
          requestId,
          upstreamStatus: callableResponse.status,
          debugCallableTarget,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(callablePayload.result);
  } catch (error) {
    console.error('add-division-member proxy failure', {
      requestId,
      error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected error calling Cloud Function.',
        requestId,
        debugCallableTarget: debugFunctionsConfig,
      },
      { status: 500 },
    );
  }
}
