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
import { parseCheckoutRequest } from "@/src/billing/checkout-request";
import {
  createCheckoutSession,
  getStripeClient,
} from "@/src/billing/stripe/checkout";
import { createPaddleCheckout } from "@/src/billing/paddle/checkout";
import { getPaddleClient } from "@/src/billing/paddle/client";

export type CheckoutActionState = {
  error?: string;
  url?: string;
};

/**
 * Starts a provider checkout session for the caller's organization.
 * OWNER/ADMIN only, active organizations only, plan/interval validated
 * against the catalog, Price ID resolved server-side by the configured
 * provider (Paddle or Stripe). Returns the provider-hosted checkout URL
 * for the client to navigate to — the browser never supplies a price,
 * customer, or session identifier.
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

  const provider = resolveBillingProvider()?.key;
  if (provider !== "stripe" && provider !== "paddle") {
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

  // Self-serve checkout only creates NEW subscriptions. There is no
  // upgrade/downgrade/proration workflow yet, so allowing checkout while
  // a provider subscription is live would create a second Paddle
  // subscription and double-bill the customer.
  if (
    subscription?.providerSubscriptionId &&
    subscription.status !== "CANCELED"
  ) {
    return {
      error:
        "You already have an active subscription. Plan changes are not yet self-serve — contact support.",
    };
  }

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : "";
  if (!baseUrl) {
    return { error: "Checkout could not be started." };
  }

  const checkoutInput = {
    organizationId,
    plan: parsed.plan,
    interval: parsed.interval,
  };
  let result: { ok: true; url: string } | { ok: false; error: string };
  if (provider === "stripe") {
    const stripe = getStripeClient();
    if (!stripe) {
      return { error: "Billing is not configured for this workspace." };
    }
    result = await createCheckoutSession({
      stripe,
      ...checkoutInput,
      customerId: subscription?.providerCustomerId ?? null,
      customerEmail: session.user.email ?? null,
      baseUrl,
    });
  } else {
    const paddle = getPaddleClient();
    if (!paddle) {
      return { error: "Billing is not configured for this workspace." };
    }
    result = await createPaddleCheckout({
      paddle,
      ...checkoutInput,
      checkoutPageUrl: `${baseUrl}/checkout/paddle`,
    });
  }

  if (!result.ok) return { error: result.error };
  return { url: result.url };
}
