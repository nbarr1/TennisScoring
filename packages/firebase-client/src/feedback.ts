import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export type FeedbackCategory = 'bug' | 'feature' | 'match_scoring' | 'account' | 'other';

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  message: string;
  allowContact: boolean;
  source: 'web' | 'mobile';
  path?: string;
  userAgent?: string;
  metadata?: Record<string, string>;
  user?: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    divisionId?: string | null;
  };
}

export interface SubmitFeedbackResult {
  success: boolean;
  issueUrl?: string;
}

export async function submitFeedback(
  feedback: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  const callable = httpsCallable<SubmitFeedbackInput, SubmitFeedbackResult>(
    functions,
    'submitFeedback',
  );
  const result = await callable({
    ...feedback,
    message: feedback.message.trim(),
  });
  return result.data;
}
