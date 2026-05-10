import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export type SubmitFeedbackPayload = {
  title: string;
  body: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
};

export type SubmitFeedbackResponse = {
  issueNumber: number;
  issueUrl: string;
};

export async function submitFeedback(
  payload: SubmitFeedbackPayload,
): Promise<SubmitFeedbackResponse> {
  const callable = httpsCallable<SubmitFeedbackPayload, SubmitFeedbackResponse>(
    functions,
    'submitFeedback',
  );
  const result = await callable({
    title: payload.title.trim(),
    body: payload.body.trim(),
    labels: payload.labels,
    metadata: payload.metadata,
  });
  return result.data;
}
