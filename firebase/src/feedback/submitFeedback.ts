import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createSign } from 'node:crypto';

if (!getApps().length) initializeApp();

const githubTokenSecret = defineSecret('GITHUB_TOKEN');
const githubAppIdSecret = defineSecret('GITHUB_APP_ID');
const githubAppPrivateKeySecret = defineSecret('GITHUB_APP_PRIVATE_KEY');
const githubAppInstallationIdSecret = defineSecret('GITHUB_APP_INSTALLATION_ID');

type FeedbackInput = {
  category?: unknown;
  message?: unknown;
  severity?: unknown;
  source?: unknown;
  appVersion?: unknown;
  route?: unknown;
  device?: unknown;
  browser?: unknown;
  platform?: unknown;
  metadata?: unknown;
};

type UserProfile = {
  email?: string;
  displayName?: string;
  name?: string;
  role?: string;
  divisionId?: string | null;
};

type GitHubIssue = {
  html_url?: string;
  number?: number;
};

type GitHubConfig = {
  owner: string;
  repo: string;
  token?: string;
  appId?: string;
  appPrivateKey?: string;
  appInstallationId?: string;
};

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_FIELD_LENGTH = 500;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS = 40;

function stringFromValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');
}

function sanitizeText(value: unknown, maxLength = MAX_FIELD_LENGTH): string | null {
  const text = stringFromValue(value);
  if (!text) return null;
  return truncate(removeControlCharacters(text), maxLength);
}

function sanitizeMessage(value: unknown): string {
  const message = sanitizeText(value, MAX_MESSAGE_LENGTH);
  if (!message) {
    throw new HttpsError('invalid-argument', 'Feedback message is required.');
  }
  return message;
}

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > MAX_METADATA_DEPTH) return '[Truncated]';
  if (value == null) return null;
  if (typeof value === 'string') return truncate(value, MAX_FIELD_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_METADATA_KEYS).map((item) => sanitizeMetadata(item, depth + 1));
  }
  if (typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
      const safeKey = sanitizeText(key, 80);
      if (safeKey) clean[safeKey] = sanitizeMetadata(item, depth + 1);
    }
    return clean;
  }
  return String(value);
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function githubConfig(): GitHubConfig | null {
  const owner = envValue('GITHUB_OWNER', 'GITHUB_REPO_OWNER', 'FEEDBACK_GITHUB_OWNER');
  const repo = envValue('GITHUB_REPO', 'GITHUB_REPO_NAME', 'FEEDBACK_GITHUB_REPO');
  if (!owner || !repo) return null;

  return {
    owner,
    repo,
    token: envValue('GITHUB_TOKEN'),
    appId: envValue('GITHUB_APP_ID'),
    appPrivateKey: envValue('GITHUB_APP_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    appInstallationId: envValue('GITHUB_APP_INSTALLATION_ID'),
  };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createGitHubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

async function getGitHubAccessToken(config: GitHubConfig): Promise<string | null> {
  if (config.token) return config.token;
  if (!config.appId || !config.appPrivateKey || !config.appInstallationId) return null;

  const jwt = createGitHubAppJwt(config.appId, config.appPrivateKey);
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(config.appInstallationId)}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'User-Agent': 'tennis-scoring-feedback-function',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub App token request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { token?: string };
  return data.token ?? null;
}

function githubIssueBody(options: {
  feedbackId: string;
  uid: string;
  userEmail: string | null;
  displayName: string | null;
  category: string;
  severity: string;
  source: string;
  appVersion: string | null;
  route: string | null;
  message: string;
  metadata: Record<string, unknown>;
}): string {
  const details = {
    feedbackId: options.feedbackId,
    uid: options.uid,
    userEmail: options.userEmail,
    displayName: options.displayName,
    category: options.category,
    severity: options.severity,
    source: options.source,
    appVersion: options.appVersion,
    route: options.route,
    metadata: options.metadata,
  };

  return [
    'A user submitted feedback from Tennis Scoring.',
    '',
    '## Message',
    options.message,
    '',
    '## Details',
    '```json',
    JSON.stringify(details, null, 2),
    '```',
  ].join('\n');
}

async function createGitHubIssue(options: {
  feedbackId: string;
  uid: string;
  userEmail: string | null;
  displayName: string | null;
  category: string;
  severity: string;
  source: string;
  appVersion: string | null;
  route: string | null;
  message: string;
  metadata: Record<string, unknown>;
}): Promise<GitHubIssue | null> {
  const config = githubConfig();
  if (!config) return null;

  const token = await getGitHubAccessToken(config);
  if (!token) return null;

  const title = `[${options.severity}] ${options.category} feedback from ${options.source}`;
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'tennis-scoring-feedback-function',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: truncate(title, 256),
        body: githubIssueBody(options),
        labels: ['feedback', options.category, `severity:${options.severity}`],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub issue creation failed (${response.status}): ${body}`);
  }

  return (await response.json()) as GitHubIssue;
}

function emailHtml(message: string): string {
  return message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

async function notifyOwners(options: {
  feedbackId: string;
  category: string;
  severity: string;
  source: string;
  message: string;
  githubIssueUrl: string | null;
}): Promise<void> {
  const db = getFirestore();
  const ownerEmails = (envValue('FEEDBACK_OWNER_EMAILS', 'OWNER_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  if (ownerEmails.length > 0) {
    await db.collection('mail').add({
      to: ownerEmails,
      message: {
        subject: `[Tennis Scoring] ${options.severity} ${options.category} feedback`,
        text: `${options.message}\n\nFeedback ID: ${options.feedbackId}${options.githubIssueUrl ? `\nGitHub: ${options.githubIssueUrl}` : ''}`,
        html: `<p>${emailHtml(options.message)}</p><p>Feedback ID: ${options.feedbackId}</p>${options.githubIssueUrl ? `<p><a href="${emailHtml(options.githubIssueUrl)}">GitHub issue</a></p>` : ''}`,
      },
      metadata: {
        type: 'feedback_submitted',
        feedbackId: options.feedbackId,
        githubIssueUrl: options.githubIssueUrl,
      },
    });
  }

  const adminSnaps = await db.collection('users').where('role', '==', 'admin').get();
  const tokens = adminSnaps.docs.flatMap((snap) => {
    const tokensValue = snap.data().fcmTokens;
    return Array.isArray(tokensValue)
      ? tokensValue.filter((token): token is string => typeof token === 'string' && token.length > 0)
      : [];
  });

  if (tokens.length > 0) {
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `${options.severity} feedback submitted`,
        body: truncate(options.message, 120),
      },
      data: {
        type: 'feedback',
        feedbackId: options.feedbackId,
        category: options.category,
        source: options.source,
        githubIssueUrl: options.githubIssueUrl ?? '',
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  }
}

export const submitFeedback = onCall(
  {
    secrets: [
      githubTokenSecret,
      githubAppIdSecret,
      githubAppPrivateKeySecret,
      githubAppInstallationIdSecret,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'You must be signed in to submit feedback.');
    }

    const input = (request.data ?? {}) as FeedbackInput;
    const message = sanitizeMessage(input.message);
    const category = sanitizeText(input.category, 80) ?? 'general';
    const severity = sanitizeText(input.severity, 40) ?? 'normal';
    const source = sanitizeText(input.source, 80) ?? 'unknown';
    const appVersion = sanitizeText(input.appVersion, 80);
    const route = sanitizeText(input.route, 300);
    const metadata = {
      device: sanitizeMetadata(input.device),
      browser: sanitizeMetadata(input.browser),
      platform: sanitizeMetadata(input.platform),
      extra: sanitizeMetadata(input.metadata),
    };

    const db = getFirestore();
    const uid = request.auth.uid;
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('failed-precondition', 'Your user profile could not be found.');
    }

    const user = userSnap.data() as UserProfile;
    const userEmail = user.email ?? request.auth.token.email ?? null;
    const displayName = user.displayName ?? user.name ?? request.auth.token.name ?? null;
    const feedbackRef = db.collection('feedback').doc();

    await feedbackRef.set({
      userId: uid,
      userEmail,
      displayName,
      userRole: user.role ?? null,
      divisionId: user.divisionId ?? null,
      category,
      message,
      severity,
      source,
      appVersion,
      route,
      metadata,
      status: 'submitted',
      githubIssueStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      submittedAt: FieldValue.serverTimestamp(),
    });

    let githubIssueUrl: string | null = null;
    let githubIssueNumber: number | null = null;

    try {
      const issue = await createGitHubIssue({
        feedbackId: feedbackRef.id,
        uid,
        userEmail,
        displayName,
        category,
        severity,
        source,
        appVersion,
        route,
        message,
        metadata,
      });

      if (issue?.html_url && typeof issue.number === 'number') {
        githubIssueUrl = issue.html_url;
        githubIssueNumber = issue.number;
        await feedbackRef.update({
          githubIssueUrl,
          githubIssueNumber,
          githubIssueStatus: 'created',
          status: 'triage',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await feedbackRef.update({
          githubIssueStatus: 'not_configured',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      logger.error('Failed to create GitHub issue for feedback submission.', {
        feedbackId: feedbackRef.id,
        error,
      });
      await feedbackRef.update({
        githubIssueStatus: 'failed',
        githubIssueError: error instanceof Error ? truncate(error.message, 1_000) : 'Unknown error',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    try {
      await notifyOwners({
        feedbackId: feedbackRef.id,
        category,
        severity,
        source,
        message,
        githubIssueUrl,
      });
    } catch (error) {
      logger.error('Failed to notify owners about feedback submission.', {
        feedbackId: feedbackRef.id,
        error,
      });
      await feedbackRef.update({
        ownerNotificationStatus: 'failed',
        ownerNotificationError: error instanceof Error ? truncate(error.message, 1_000) : 'Unknown error',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      success: true,
      feedbackId: feedbackRef.id,
      githubIssueUrl,
      githubIssueNumber,
    };
  },
);
