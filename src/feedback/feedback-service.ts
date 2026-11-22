export const feedbackTypes = [
  "PRODUCT_SUGGESTION",
  "FEATURE_REQUEST",
  "UX_UI_FEEDBACK",
  "GENERAL_FEEDBACK",
] as const;

export type FeedbackTypeValue = (typeof feedbackTypes)[number];

export type FeedbackInput = {
  type: FeedbackTypeValue;
  subject: string;
  message: string;
  rating: number | null;
};

export type FeedbackScope = {
  userId: string;
  organizationId: string;
};

export type FeedbackRecord = {
  id: string;
  organizationId: string;
  userId: string;
  type: FeedbackTypeValue;
  subject: string;
  message: string;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OperationResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface FeedbackRepository {
  createFeedback(
    scope: FeedbackScope,
    input: FeedbackInput,
  ): Promise<FeedbackRecord>;
  listFeedbackForUser(scope: FeedbackScope): Promise<FeedbackRecord[]>;
  findFeedbackForUser(
    scope: FeedbackScope,
    feedbackId: string,
  ): Promise<FeedbackRecord | null>;
}

export function isFeedbackType(value: unknown): value is FeedbackTypeValue {
  return feedbackTypes.includes(value as FeedbackTypeValue);
}

function fieldValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseFeedbackInput(
  formData: FormData,
): { input: FeedbackInput } | { error: string } {
  const type = fieldValue(formData, "type");
  const subject = fieldValue(formData, "subject");
  const message = fieldValue(formData, "message");
  const ratingValue = fieldValue(formData, "rating");

  if (!isFeedbackType(type)) {
    return { error: "Select a valid feedback type." };
  }
  if (!subject) return { error: "Subject is required." };
  if (subject.length > 200) {
    return { error: "Subject must be 200 characters or fewer." };
  }
  if (!message) return { error: "Feedback is required." };
  if (message.length > 5000) {
    return { error: "Feedback must be 5,000 characters or fewer." };
  }

  let rating: number | null = null;
  if (ratingValue) {
    const parsed = Number(ratingValue);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      return { error: "Rating must be a whole number between 1 and 5." };
    }
    rating = parsed;
  }

  return { input: { type, subject, message, rating } };
}

function requireScope(scope: FeedbackScope): string | null {
  if (!scope?.userId || !scope?.organizationId) {
    return "An authenticated user and organization are required.";
  }
  return null;
}

export async function submitFeedback(
  scope: FeedbackScope,
  input: FeedbackInput,
  repository: FeedbackRepository,
): Promise<OperationResult<{ id: string }>> {
  const scopeError = requireScope(scope);
  if (scopeError) return { ok: false, error: scopeError };
  if (!isFeedbackType(input.type)) {
    return { ok: false, error: "Select a valid feedback type." };
  }
  if (!input.subject.trim() || !input.message.trim()) {
    return { ok: false, error: "Subject and feedback are required." };
  }
  if (
    input.rating !== null &&
    (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
  ) {
    return { ok: false, error: "Rating must be a whole number between 1 and 5." };
  }

  const record = await repository.createFeedback(scope, {
    type: input.type,
    subject: input.subject.trim(),
    message: input.message.trim(),
    rating: input.rating,
  });
  return { ok: true, value: { id: record.id } };
}

export async function listOwnFeedback(
  scope: FeedbackScope,
  repository: FeedbackRepository,
): Promise<OperationResult<FeedbackRecord[]>> {
  const scopeError = requireScope(scope);
  if (scopeError) return { ok: false, error: scopeError };
  return { ok: true, value: await repository.listFeedbackForUser(scope) };
}

export async function getOwnFeedback(
  scope: FeedbackScope,
  feedbackId: string,
  repository: FeedbackRepository,
): Promise<OperationResult<FeedbackRecord | null>> {
  const scopeError = requireScope(scope);
  if (scopeError) return { ok: false, error: scopeError };
  return {
    ok: true,
    value: await repository.findFeedbackForUser(scope, feedbackId),
  };
}
