import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getOperationsPageContext } from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import { Badge, Notice, PageHeader } from "../ui";
import { getBillingOverviewForUser } from "@/src/prisma/billing-data";
import { canAdministerOrganizationSettings } from "@/src/settings/organization-settings";
import { isAccountWritable } from "@/src/account/account-status";
import BillingPlansView from "./billing-plans";
import type { OperationsSearchParams } from "../operations-page-data";

type Props = {
  searchParams: Promise<OperationsSearchParams>;
};

export default function BillingPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading billing...
        </main>
      }
    >
      <BillingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BillingContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  const billing = await getBillingOverviewForUser(
    context.userId,
    context.organization.id,
  );
  if (!billing) notFound();

  const accountActive = isAccountWritable(context.organization.status);
  const canAdminister = canAdministerOrganizationSettings(
    context.membership.role,
  );
  const billingReturn = Array.isArray(params.billing)
    ? params.billing[0]
    : params.billing;

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="billing"
    >
      <PageHeader
        eyebrow="Billing & plans"
        title="Billing & Plans"
        description="Manage your TRUXERA plan, subscription, and fleet capacity."
        actions={
          billing.subscriptionStatusLabel ? (
            <Badge
              tone={
                billing.subscriptionStatus === "ACTIVE" ||
                billing.subscriptionStatus === "TRIAL"
                  ? "success"
                  : billing.subscriptionStatus === "PAUSED"
                    ? "warning"
                    : "neutral"
              }
            >
              {billing.subscriptionStatusLabel}
            </Badge>
          ) : undefined
        }
      />

      <div className="mt-6 space-y-4">
        {billingReturn === "checkout_success" && (
          <Notice tone="info">
            Checkout completed. Your subscription will update once Stripe
            confirms the payment — this usually takes a few seconds. Refresh
            this page to see the latest status.
          </Notice>
        )}
        {billingReturn === "checkout_canceled" && (
          <Notice tone="warning">
            Checkout was canceled. No changes were made to your subscription.
          </Notice>
        )}
        {typeof billingReturn === "string" &&
          billingReturn !== "checkout_success" &&
          billingReturn !== "checkout_canceled" && (
            <Notice tone="warning">
              Billing checkout could not be completed. Please try again.
            </Notice>
          )}

        <BillingPlansView
          organizationId={context.organization.id}
          billing={billing}
          canAdminister={canAdminister}
          accountActive={accountActive}
        />
      </div>
    </TruckShell>
  );
}
