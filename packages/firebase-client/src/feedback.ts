import { httpsCallable } from "firebase/functions";
import { functions } from "./config";

export type FeedbackCategory =
  | "bug"
  | "feature"
  | "feature_request"
  | "match_scoring"
  | "account"
  | "general"
  | "other";

export type SubmitFeedbackPayload = {
  title?: string;
  body?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
  category?: FeedbackCategory | string;
  message?: string;
  allowContact?: boolean;
  source?: string;
  path?: string;
  page?: string;
  screen?: string;
  userAgent?: string;
  platform?: string;
  appVersion?: string | null;
  nativeAppVersion?: string | null;
  nativeBuildVersion?: string | null;
  userId?: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  user?: {
    uid?: string | null;
    displayName?: string | null;
    email?: string | null;
    divisionId?: string | null;
  };
  screenContext?: Record<string, unknown>;
};

type CallableFeedbackPayload = {
  title: string;
  body: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
};

export type SubmitFeedbackResponse = {
  issueNumber: number;
  issueUrl: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug report",
  feature: "Feature request",
  feature_request: "Feature request",
  match_scoring: "Match scoring",
  account: "Account or division",
  general: "General feedback",
  other: "Other feedback",
};

function cleanString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatCategory(category: string | undefined): string {
  if (!category) return "Feedback";
  return CATEGORY_LABELS[category] ?? category;
}

function buildTitle(payload: SubmitFeedbackPayload): string {
  const explicitTitle = cleanString(payload.title);
  if (explicitTitle) return explicitTitle;

  const categoryLabel = formatCategory(cleanString(payload.category));
  const source = cleanString(payload.source);
  return source ? `${categoryLabel} from ${source}` : categoryLabel;
}

function buildBody(payload: SubmitFeedbackPayload): string {
  const explicitBody = cleanString(payload.body);
  if (explicitBody) return explicitBody;

  const message =
    cleanString(payload.message) ?? "No feedback message provided.";
  const details: string[] = [];
  const category = cleanString(payload.category);
  const location =
    cleanString(payload.path) ??
    cleanString(payload.page) ??
    cleanString(payload.screen);

  if (category) details.push(`Category: ${formatCategory(category)}`);
  if (payload.allowContact !== undefined) {
    details.push(`May contact user: ${payload.allowContact ? "yes" : "no"}`);
  }
  if (location) details.push(`Location: ${location}`);

  return details.length ? `${message}\n\n${details.join("\n")}` : message;
}

function buildLabels(payload: SubmitFeedbackPayload): string[] | undefined {
  const labels = [...(payload.labels ?? [])];
  const category = cleanString(payload.category);

  if (category) labels.push(category.replace(/_/g, "-"));

  const uniqueLabels = Array.from(
    new Set(labels.map((label) => label.trim()).filter(Boolean)),
  );
  return uniqueLabels.length ? uniqueLabels : undefined;
}

function buildMetadata(
  payload: SubmitFeedbackPayload,
): Record<string, unknown> | undefined {
  const allowContact = payload.allowContact === true;
  const metadata: Record<string, unknown> = {
    ...payload.metadata,
    source: payload.source,
    path: payload.path,
    page: payload.page,
    screen: payload.screen,
    userAgent: payload.userAgent,
    platform: payload.platform,
    appVersion: payload.appVersion,
    nativeAppVersion: payload.nativeAppVersion,
    nativeBuildVersion: payload.nativeBuildVersion,
    divisionId: payload.user?.divisionId,
    allowContact: payload.allowContact,
    screenContext: payload.screenContext,
    ...(allowContact
      ? {
          userId: payload.userId ?? payload.user?.uid,
          userEmail: payload.userEmail ?? payload.user?.email,
          userDisplayName: payload.userDisplayName ?? payload.user?.displayName,
        }
      : {}),
  };

  const filteredMetadata = Object.fromEntries(
    Object.entries(metadata).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
  return Object.keys(filteredMetadata).length ? filteredMetadata : undefined;
}

function toCallablePayload(
  payload: SubmitFeedbackPayload,
): CallableFeedbackPayload {
  return {
    title: buildTitle(payload),
    body: buildBody(payload),
    labels: buildLabels(payload),
    metadata: buildMetadata(payload),
  };
}

export async function submitFeedback(
  payload: SubmitFeedbackPayload,
): Promise<SubmitFeedbackResponse> {
  const callable = httpsCallable<
    CallableFeedbackPayload,
    SubmitFeedbackResponse
  >(functions, "submitFeedback");
  const result = await callable(toCallablePayload(payload));
  return result.data;
}
