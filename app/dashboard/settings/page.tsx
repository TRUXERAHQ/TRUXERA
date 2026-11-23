import { Suspense } from "react";
import { auth } from "@/auth";
import TruckShell from "../trucks/truck-shell";
import {
  getOperationsPageContext,
  type OperationsSearchParams,
} from "../operations-page-data";
import { canAdministerOrganizationSettings } from "@/src/settings/organization-settings";
import { canManageFleet } from "@/src/trucks/truck-policy";
import {
  listConnectorCatalog,
  listIntegrationsForOrganization,
} from "@/src/prisma/integration-data";
import { getConnectedSignalsOverview } from "@/src/prisma/connected-signals";
import { getOnboardingFactsForUser } from "@/src/prisma/onboarding-data";
import { getAccountOverviewForUser } from "@/src/prisma/organization-data";
import { getReliabilityOverviewForUser } from "@/src/prisma/reliability-data";
import { getBillingOverviewForUser } from "@/src/prisma/billing-data";
import { computeOnboardingState } from "@/src/onboarding/onboarding";
import { PageHeader } from "../ui";
import SettingsSections from "./settings-sections";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function SettingsPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading settings...
        </main>
      }
    >
      <SettingsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SettingsContent({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams);
  const session = await auth();

  const [
    integrations,
    connectorCatalog,
    signals,
    accountOverview,
    reliability,
    billing,
  ] = await Promise.all([
    listIntegrationsForOrganization(context.userId, context.organization.id),
    listConnectorCatalog(),
    getConnectedSignalsOverview(
      context.userId,
      context.organization.id,
    ),
    getAccountOverviewForUser(context.userId, context.organization.id),
    getReliabilityOverviewForUser(context.userId, context.organization.id),
    getBillingOverviewForUser(context.userId, context.organization.id),
  ]);

  const onboardingFacts = await getOnboardingFactsForUser(
    context.userId,
    context.organization.id,
    integrations.map((integration) => ({
      providerKey: integration.providerKey,
      displayName: integration.displayName,
      status: integration.status,
      health: integration.health,
      lastSyncAt: integration.lastSyncAt,
    })),
  );
  const onboarding = onboardingFacts
    ? computeOnboardingState(onboardingFacts, context.organization.id)
    : null;

  const timeZones = Intl.supportedValuesOf("timeZone");

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="settings"
    >
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Settings"
          description="Manage your TRUXERA workspace, operational preferences, access, and connected-fleet configuration."
        />
        <SettingsSections
          organizationId={context.organization.id}
          organizationName={context.organization.name}
          organizationSlug={context.organization.slug}
          organizationIdValue={context.organization.id}
          timezone={context.organization.timezone}
          timeZones={timeZones}
          canAdminister={canAdministerOrganizationSettings(
            context.membership.role,
          )}
          membershipRole={context.membership.role}
          memberSince={context.membership.createdAt?.toISOString() ?? null}
          userName={session?.user?.name ?? null}
          userEmail={session?.user?.email ?? null}
          integrations={integrations}
          signalSummaries={signals?.integrations ?? []}
          connectorCatalog={connectorCatalog}
          onboarding={onboarding}
          canManageFleet={canManageFleet(context.membership.role)}
          accountStatus={context.organization.status}
          account={
            accountOverview
              ? {
                  owner: accountOverview.owner,
                  adminCount: accountOverview.adminCount,
                  memberCount: accountOverview.memberCount,
                  counts: accountOverview.counts,
                  createdAt:
                    accountOverview.organization.createdAt?.toISOString() ??
                    null,
                }
              : null
          }
          reliability={reliability}
          billing={billing}
        />
      </div>
    </TruckShell>
  );
}
