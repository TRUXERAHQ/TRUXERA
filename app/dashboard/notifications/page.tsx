import { Suspense } from "react";
import { getOperationsPageContext } from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import { PageHeader } from "../ui";
import NotificationsView from "./notifications-view";
import { getNotificationsForOrganization } from "@/src/notifications/notifications";
import type { OperationsSearchParams } from "../operations-page-data";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function NotificationsPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading notifications...
        </main>
      }
    >
      <NotificationsLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function NotificationsLoader({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams);
  const notifications = await getNotificationsForOrganization({
    userId: context.userId,
    organizationId: context.organization.id,
  });

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="notifications"
    >
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Operations"
          title="Notifications"
          description="Operational alerts, recovery activity, and account notices for your organization."
        />
        <div className="mt-6">
          <NotificationsView
            notifications={notifications ?? []}
            timeZone={context.organization.timezone}
          />
        </div>
      </div>
    </TruckShell>
  );
}
