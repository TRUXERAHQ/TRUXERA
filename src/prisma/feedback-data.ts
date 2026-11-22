import { getMembershipForUserInOrganization } from "./organization-data";
import { connectDatabase, db } from "./db";
import { isUuid } from "@/src/trucks/truck-policy";
import {
  getOwnFeedback,
  listOwnFeedback,
  submitFeedback,
  type FeedbackInput,
  type FeedbackRecord,
  type FeedbackRepository,
  type FeedbackScope,
  type OperationResult,
} from "@/src/feedback/feedback-service";

async function isOrganizationMember(userId: string, organizationId: string) {
  if (!isUuid(organizationId)) return false;
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  return Boolean(membership);
}

const repository: FeedbackRepository = {
  async createFeedback(scope: FeedbackScope, input: FeedbackInput) {
    return db.orm.public.Feedback.create({
      organizationId: scope.organizationId,
      userId: scope.userId,
      type: input.type,
      subject: input.subject,
      message: input.message,
      rating: input.rating,
    }) as Promise<FeedbackRecord>;
  },
  async listFeedbackForUser(scope: FeedbackScope) {
    return (await db.orm.public.Feedback.where({
      organizationId: scope.organizationId,
      userId: scope.userId,
    })
      .orderBy((feedback) => feedback.createdAt.desc())
      .all()) as FeedbackRecord[];
  },
  async findFeedbackForUser(scope: FeedbackScope, feedbackId: string) {
    if (!isUuid(feedbackId)) return null;
    return (await db.orm.public.Feedback.where({
      organizationId: scope.organizationId,
      userId: scope.userId,
      id: feedbackId,
    }).first()) as FeedbackRecord | null;
  },
};

async function requireMemberScope(
  userId: string,
  organizationId: string,
): Promise<FeedbackScope | null> {
  if (!(await isOrganizationMember(userId, organizationId))) return null;
  return { userId, organizationId };
}

export async function submitFeedbackForUser(
  userId: string,
  organizationId: string,
  input: FeedbackInput,
): Promise<OperationResult<{ id: string }>> {
  await connectDatabase();
  const scope = await requireMemberScope(userId, organizationId);
  if (!scope) {
    return { ok: false, error: "You do not have access to this organization." };
  }
  return submitFeedback(scope, input, repository);
}

export async function getFeedbackForUser(
  userId: string,
  organizationId: string,
): Promise<FeedbackRecord[] | null> {
  await connectDatabase();
  const scope = await requireMemberScope(userId, organizationId);
  if (!scope) return null;
  const result = await listOwnFeedback(scope, repository);
  return result.ok ? result.value : null;
}

export async function getFeedbackDetailForUser(
  userId: string,
  organizationId: string,
  feedbackId: string,
): Promise<FeedbackRecord | null> {
  await connectDatabase();
  const scope = await requireMemberScope(userId, organizationId);
  if (!scope) return null;
  const result = await getOwnFeedback(scope, feedbackId, repository);
  return result.ok ? result.value : null;
}
