import { getApps, initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';

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
const appBaseUrl = defineString('APP_BASE_URL', { default: 'http://localhost:3000' });

const callableOptions = {
  cors: appBaseUrl.value(),
  secrets: [githubToken],
};

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 8_000;
const MAX_METADATA_LENGTH = 1_000;
const MAX_LABELS = 10;

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

function formatMetadata(metadata: unknown, uid?: string): string {
  const lines = ['---', 'Submitted via Firebase Functions.'];
  if (uid) lines.push(`Firebase Auth UID: ${uid}`);

  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const entries = Object.entries(metadata as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null)
      .slice(0, 20)
      .map(([key, value]) => {
        const safeKey = truncate(key.trim(), 80);
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        return `- ${safeKey}: ${truncate(serialized, MAX_METADATA_LENGTH)}`;
      });

    if (entries.length) {
      lines.push('', 'Metadata:', ...entries);
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
