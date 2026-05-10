export type FeedbackCategory = 'bug' | 'feature_request' | 'general';

export interface SubmitFeedbackInput {
  message: string;
  category?: FeedbackCategory;
  page?: string;
  userAgent?: string;
  email?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SubmitFeedbackResult {
  success: boolean;
  feedbackId?: string;
}
