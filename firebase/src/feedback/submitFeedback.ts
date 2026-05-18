import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createHash } from 'node:crypto';

if (!getApps().length) initializeApp();

const githubToken = defineSecret('GITHUB_TOKEN');
const githubOwner = defineString('GITHUB_OWNER');
const githubRepo = defineString('GITHUB_REPO');
const githubApiUrl = defineString('GITHUB_API_URL', {
  default: 'https://api.github.com',
});
const githubFeedbackLabels = defineString('GITHUB_FEEDBACK_LABELS', {
  default: 'feedback',
});
const callableOptions = {
  secrets: [githubToken],
};

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 8_000;
const MAX_METADATA_LENGTH = 1_000;
const MAX_LABELS = 10;
const FEEDBACK_RATE_LIMIT = 5;
const FEEDBACK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type SubmitFeedbackInput = {
  title?: unknown;
  body?: unknown;
  labels?: unknown;
  metadata?: unknown;
};

export type SubmitFeedbackResult = {
  issueNumber: number;
  issueUrl: string;
};

type GitHubIssueResponse = {
  number?: unknown;
  html_url?: unknown;
  message?: unknown;
};

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function rateLimitKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function requestClientKey(request: { auth?: { uid?: string } | null; rawRequest?: { ip?: string; headers?: { [key: string]: unknown } } }): string {
  const uid = request.auth?.uid;
  if (uid) return `uid:${uid}`;
  const forwardedFor = request.rawRequest?.headers?.['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = typeof forwardedIp === 'string'
    ? forwardedIp.split(',')[0].trim()
    : request.rawRequest?.ip;
  return `ip:${ip || 'unknown'}`;
}

async function assertRateLimit(
  db: FirebaseFirestore.Firestore,
  keyParts: string[],
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = Date.now();
  const ref = db.collection('rateLimits').doc(rateLimitKey(...keyParts));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { count?: number; resetAt?: number } | undefined;
    const resetAt = typeof data?.resetAt === 'number' ? data.resetAt : 0;
    if (!snap.exists || resetAt <= now) {
      tx.set(ref, {
        count: 1,
        resetAt: now + windowMs,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    const count = typeof data?.count === 'number' ? data.count : 0;
    if (count >= limit) {
      throw new HttpsError('resource-exhausted', 'Too many feedback submissions. Please try again later.');
    }
    tx.update(ref, {
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function getConfiguredValue(param: ReturnType<typeof defineString>, name: string): string {
  const value = param.value().trim();
  if (!value) {
    throw new HttpsError(
      'failed-precondition',
      `${name} must be configured in Firebase Functions config/params.`,
    );
  }
  return value;
}

function normalizeLabels(labels: unknown): string[] {
  const configuredLabels = githubFeedbackLabels
    .value()
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);

  const requestedLabels = Array.isArray(labels)
    ? labels.filter((label): label is string => typeof label === 'string')
    : [];

  return Array.from(
    new Set(
      [...configuredLabels, ...requestedLabels]
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => truncate(label, 50)),
    ),
  ).slice(0, MAX_LABELS);
}

function hashedUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex');
}

function metadataAllowsContact(metadata: unknown): boolean {
  return !!(
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).allowContact === true
  );
}

function formatMetadata(metadata: unknown, uid?: string): string {
  const lines = ['---', 'Submitted via Firebase Functions.'];
  const allowContact = metadataAllowsContact(metadata);
  if (uid && allowContact) lines.push(`Firebase Auth UID hash: ${hashedUid(uid)}`);

  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const entries = Object.entries(metadata as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null)
      .slice(0, 20)
      .map(([key, value]) => {
        const safeKey = truncate(key.trim(), 80);
        if (!allowContact && ['userId', 'userEmail', 'userDisplayName'].includes(safeKey)) {
          return undefined;
        }
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        return `- ${safeKey}: ${truncate(serialized, MAX_METADATA_LENGTH)}`;
      });

    const safeEntries = entries.filter((entry): entry is string => entry !== undefined);
    if (safeEntries.length) {
      lines.push('', 'Metadata:', ...safeEntries);
    }
  }

  return lines.join('\n');
}

function buildIssueBody(body: string, metadata: unknown, uid?: string): string {
  return `${truncate(body, MAX_BODY_LENGTH)}\n\n${formatMetadata(metadata, uid)}`;
}

export const submitFeedback = onCall(callableOptions, async (request): Promise<SubmitFeedbackResult> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to submit feedback.');
  }

  const db = getFirestore();
  await assertRateLimit(
    db,
    ['submitFeedback', requestClientKey(request)],
    FEEDBACK_RATE_LIMIT,
    FEEDBACK_RATE_LIMIT_WINDOW_MS,
  );

  const data = (request.data ?? {}) as SubmitFeedbackInput;
  const title = truncate(requireNonEmptyString(data.title, 'Feedback title'), MAX_TITLE_LENGTH);
  const body = requireNonEmptyString(data.body, 'Feedback body');
  const owner = getConfiguredValue(githubOwner, 'GITHUB_OWNER');
  const repo = getConfiguredValue(githubRepo, 'GITHUB_REPO');
  const token = githubToken.value().trim();

  if (!token) {
    throw new HttpsError(
      'failed-precondition',
      'GITHUB_TOKEN must be stored in Firebase Functions secret storage.',
    );
  }

  const apiBaseUrl = githubApiUrl.value().replace(/\/+$/, '');
  const response = await fetch(
    `${apiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'tennis-scoring-firebase-functions',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title,
        body: buildIssueBody(body, data.metadata, request.auth.uid),
        labels: normalizeLabels(data.labels),
      }),
    },
  );

  const responseBody = (await response.json().catch(() => ({}))) as GitHubIssueResponse;
  if (!response.ok) {
    logger.error('GitHub issue creation failed', {
      status: response.status,
      message: responseBody.message,
    });
    throw new HttpsError('internal', 'Could not submit feedback. Please try again later.');
  }

  if (typeof responseBody.number !== 'number' || typeof responseBody.html_url !== 'string') {
    logger.error('GitHub issue creation returned an unexpected payload', responseBody);
    throw new HttpsError('internal', 'Feedback was submitted but GitHub returned an unexpected response.');
  }

  return {
    issueNumber: responseBody.number,
    issueUrl: responseBody.html_url,
  };
});
