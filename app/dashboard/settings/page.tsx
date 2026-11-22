import { Suspense } from "react";
import { auth } from "@/auth";
import TruckShell from "../trucks/truck-shell";
import {
  getOperationsPageContext,
  type OperationsSearchParams,
} from "../operations-page-data";
import { canAdministerOrganizationSettings } from "@/src/settings/organization-settings";
import {
  listConnectorCatalog,
  listIntegrationsForOrganization,
} from "@/src/prisma/integration-data";
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

  const [integrations, connectorCatalog] = await Promise.all([
    listIntegrationsForOrganization(context.userId, context.organization.id),
    listConnectorCatalog(),
  ]);

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
          connectorCatalog={connectorCatalog}
        />
      </div>
    </TruckShell>
  );
}
