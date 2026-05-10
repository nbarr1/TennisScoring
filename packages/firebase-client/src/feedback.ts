import { httpsCallable } from 'firebase/functions';
import { functions } from './config';
import type {
  SubmitFeedbackInput,
  SubmitFeedbackResult,
} from '@tennis/shared';

export type { SubmitFeedbackInput, SubmitFeedbackResult } from '@tennis/shared';

export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  const callable = httpsCallable<SubmitFeedbackInput, SubmitFeedbackResult>(
    functions,
    'submitFeedback',
  );
  const result = await callable(input);
  return result.data;
}
