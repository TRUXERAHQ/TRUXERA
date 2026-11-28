import { connectDatabase, db } from "../prisma/db";
import {
  organizationHasOperationalAccess,
  type BillingSubscriptionRecord,
} from "./billing";

/**
 * Loads the org's subscription row and evaluates the mandatory
 * subscription gate. Returns true when operational access is allowed.
 */
export async function checkOperationalAccess(input: {
  organizationId: string;
  organizationCreatedAt: Date | string | null | undefined;
}): Promise<boolean> {
  await connectDatabase();
  const subscription = (await db.orm.public.BillingSubscription.where({
    organizationId: input.organizationId,
  }).first()) as unknown as BillingSubscriptionRecord | null;
  return organizationHasOperationalAccess({
    createdAt: input.organizationCreatedAt,
    subscription,
  });
}
