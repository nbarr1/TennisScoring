import { addDoc, collection } from "firebase/firestore";
import { db } from "./config";

export interface FeedbackSubmission {
  userId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  category: string;
  message: string;
  source: "mobile" | "web";
  platform?: string | null;
  appVersion?: string | null;
  nativeAppVersion?: string | null;
  nativeBuildVersion?: string | null;
  screen?: string | null;
  screenContext?: Record<string, unknown> | null;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export async function submitFeedback(
  submission: FeedbackSubmission,
): Promise<string> {
  const ref = await addDoc(
    collection(db, "feedback"),
    withoutUndefined({
      ...submission,
      category: submission.category.trim(),
      message: submission.message.trim(),
      status: "new",
      createdAt: Date.now(),
    }),
  );

  return ref.id;
}
