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
  json: CallableSuccessPayload | undefined;
  rawText: string;
}> {
  const rawText = await response.text();
  if (!rawText) return { json: undefined, rawText };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { json: undefined, rawText };
  }
  const candidate = parsed as CallableSuccessPayload;
  const hasResult = typeof candidate.result?.userId === 'string';
  const hasError = typeof candidate.error?.message === 'string';
  const json = hasResult || hasError ? candidate : undefined;
  return { json, rawText };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
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
    ).catch(() => ({ json: undefined, rawText: '' }));

    const hasValidResult = typeof callablePayload?.result?.userId === 'string';
    if (!callableResponse.ok || !hasValidResult) {
      console.error('add-division-member upstream failure', {
        requestId,
        callableUrl,
        status: callableResponse.status,
        statusText: callableResponse.statusText,
        hasAuthHeader: Boolean(authHeader),
        upstreamError: callablePayload?.error?.message ?? null,
        upstreamBodyPreview: rawText.slice(0, 500),
        payloadMissingOrInvalid: callablePayload === undefined,
      });
      return NextResponse.json(
        {
          error:
            callablePayload?.error?.message ??
            'Cloud Function call failed.',
          requestId,
          upstreamStatus: callableResponse.status,
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
        error: 'Unexpected error calling Cloud Function.',
        requestId,
      },
      { status: 500 },
    );
  }
}
