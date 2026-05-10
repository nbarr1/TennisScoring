import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';

if (!getApps().length) initializeApp();

const callableOptions = { cors: true } as const;
const MAX_MESSAGE_LENGTH = 4_000;
const RATE_LIMIT_MAX_SUBMISSIONS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const RECENT_FEEDBACK_HISTORY_LIMIT = 20;

const ALLOWED_CATEGORIES = [
  'bug',
  'feature_request',
  'scoring_issue',
  'account_issue',
  'general',
] as const;

const allowedCategorySet = new Set<string>(ALLOWED_CATEGORIES);

type FeedbackCategory = (typeof ALLOWED_CATEGORIES)[number];

type SubmitFeedbackInput = {
  category?: unknown;
  message?: unknown;
  page?: unknown;
  metadata?: unknown;
};

type RateLimitSubmission = {
  submittedAt: number;
};

type RecentFeedbackEntry = {
  category: FeedbackCategory;
  messageHash: string;
  submittedAt: number;
};

type FeedbackRateLimitData = {
  submissions?: RateLimitSubmission[];
  recentFeedback?: RecentFeedbackEntry[];
};

function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, ' ');
}

function messageHashFor(category: FeedbackCategory, message: string): string {
  return createHash('sha256')
    .update(category)
    .update('\0')
    .update(message.toLowerCase())
    .digest('hex');
}

function validateFeedbackInput(data: SubmitFeedbackInput) {
  const rawMessage = data.message;
  if (typeof rawMessage !== 'string') {
    throw new HttpsError('invalid-argument', 'Feedback message is required.');
  }

  const message = normalizeMessage(rawMessage);
  if (!message) {
    throw new HttpsError('invalid-argument', 'Feedback message is required.');
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Feedback message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      { maxLength: MAX_MESSAGE_LENGTH },
    );
  }

  const rawCategory = data.category;
  if (typeof rawCategory !== 'string' || !allowedCategorySet.has(rawCategory)) {
    throw new HttpsError(
      'invalid-argument',
      'Feedback category is required and must be one of the allowed values.',
      { allowedCategories: ALLOWED_CATEGORIES },
    );
  }

  const page = typeof data.page === 'string' && data.page.trim()
    ? data.page.trim().slice(0, 500)
    : null;

  return {
    category: rawCategory as FeedbackCategory,
    message,
    page,
    metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : null,
  };
}

function validSubmission(value: unknown): value is RateLimitSubmission {
  return !!value
    && typeof value === 'object'
    && typeof (value as RateLimitSubmission).submittedAt === 'number';
}

function validRecentFeedback(value: unknown): value is RecentFeedbackEntry {
  const entry = value as RecentFeedbackEntry;
  return !!entry
    && typeof entry === 'object'
    && typeof entry.submittedAt === 'number'
    && typeof entry.messageHash === 'string'
    && allowedCategorySet.has(entry.category);
}

export const submitFeedback = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in to submit feedback.',
    );
  }

  const feedback = validateFeedbackInput((request.data ?? {}) as SubmitFeedbackInput);
  const { uid, token } = request.auth;
  const db = getFirestore();
  const feedbackRef = db.collection('feedback').doc();
  const rateLimitRef = db.collection('feedbackRateLimits').doc(uid);
  const nowMs = Date.now();
  const rateLimitCutoffMs = nowMs - RATE_LIMIT_WINDOW_MS;
  const duplicateCutoffMs = nowMs - DUPLICATE_WINDOW_MS;
  const messageHash = messageHashFor(feedback.category, feedback.message);

  await db.runTransaction(async (tx) => {
    const rateLimitSnap = await tx.get(rateLimitRef);
    const rateLimitData = rateLimitSnap.data() as FeedbackRateLimitData | undefined;
    const recentSubmissions = (rateLimitData?.submissions ?? [])
      .filter(validSubmission)
      .filter((entry) => entry.submittedAt > rateLimitCutoffMs);

    if (recentSubmissions.length >= RATE_LIMIT_MAX_SUBMISSIONS) {
      throw new HttpsError(
        'resource-exhausted',
        `You can submit up to ${RATE_LIMIT_MAX_SUBMISSIONS} feedback messages per hour. Please try again later.`,
        {
          maxSubmissions: RATE_LIMIT_MAX_SUBMISSIONS,
          windowSeconds: RATE_LIMIT_WINDOW_MS / 1_000,
        },
      );
    }

    const recentFeedback = (rateLimitData?.recentFeedback ?? [])
      .map(validateFeedbackCompleteness)
      .filter((entry): entry is RecentFeedback => entry !== undefined)
      .filter((entry) => entry.submittedAt > duplicateCutoffMs);

    if (recentFeedback.some((entry) => entry.category === feedback.category && entry.messageHash === messageHash)) {
      throw new HttpsError(
        'already-exists',
        'This feedback has already been submitted recently.',
        { duplicateWindowSeconds: DUPLICATE_WINDOW_MS / 1_000 },
      );
    }

    tx.set(feedbackRef, {
      userId: uid,
      userEmail: token.email ?? null,
      userName: token.name ?? null,
      category: feedback.category,
      message: feedback.message,
      page: feedback.page,
      metadata: feedback.metadata,
      messageLength: feedback.message.length,
      messageHash,
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(rateLimitRef, {
      userId: uid,
      submissions: [
        ...recentSubmissions,
        { submittedAt: nowMs },
      ],
      recentFeedback: [
        { category: feedback.category, messageHash, submittedAt: nowMs },
        ...recentFeedback,
      ].slice(0, RECENT_FEEDBACK_HISTORY_LIMIT),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { success: true, feedbackId: feedbackRef.id };
});
