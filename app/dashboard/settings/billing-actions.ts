"use server";

import { headers } from "next/headers";
import { auth } from "@/auth";
import { isUuid } from "@/src/trucks/truck-policy";
import {
  ACCOUNT_SUSPENDED_ERROR,
  isAccountWritable,
} from "@/src/account/account-status";
import { canAdministerOrganizationSettings } from "@/src/settings/organization-settings";
import { getMembershipForUserInOrganization } from "@/src/prisma/organization-data";
import { connectDatabase, db } from "@/src/prisma/db";
import { resolveBillingProvider } from "@/src/billing/provider";
import {
  createCheckoutSession,
  getStripeClient,
  parseCheckoutRequest,
} from "@/src/billing/stripe/checkout";

export type CheckoutActionState = {
  error?: string;
  url?: string;
};

/**
 * Starts a Stripe Checkout session for the caller's organization.
 * OWNER/ADMIN only, active organizations only, plan/interval validated
 * against the catalog, Price ID resolved server-side. Returns the
 * Stripe-hosted checkout URL for the client to navigate to — the
 * browser never supplies a price, customer, or session identifier.
 */
export async function startBillingCheckoutAction(
  _previousState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please sign in to continue." };

  const organizationId = formData.get("organizationId");
  if (!isUuid(organizationId)) {
    return { error: "The selected organization could not be found." };
  }

  const parsed = parseCheckoutRequest({
    plan: formData.get("plan"),
    interval: formData.get("interval"),
  });
  if (!parsed.ok) return { error: parsed.error };

  if (resolveBillingProvider()?.key !== "stripe") {
    return { error: "Billing is not configured for this workspace." };
  }
  const stripe = getStripeClient();
  if (!stripe) {
    return { error: "Billing is not configured for this workspace." };
  }

  await connectDatabase();

  const membership = await getMembershipForUserInOrganization(
    session.user.id,
    organizationId,
  );
  if (!membership || !canAdministerOrganizationSettings(membership.role)) {
    return {
      error: "Only organization owners and admins can manage billing.",
    };
  }

  const organization = await db.orm.public.Organization.where({
    id: organizationId,
  }).first();
  if (!organization) {
    return { error: "The selected organization could not be found." };
  }
  if (!isAccountWritable(organization.status)) {
    return { error: ACCOUNT_SUSPENDED_ERROR };
  }

  const subscription = await db.orm.public.BillingSubscription.where({
    organizationId,
  }).first();

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : "";
  if (!baseUrl) {
    return { error: "Checkout could not be started." };
  }

  const result = await createCheckoutSession({
    stripe,
    organizationId,
    plan: parsed.plan,
    interval: parsed.interval,
    customerId: subscription?.providerCustomerId ?? null,
    customerEmail: session.user.email ?? null,
    baseUrl,
  });

  if (!result.ok) return { error: result.error };
  return { url: result.url };
}
