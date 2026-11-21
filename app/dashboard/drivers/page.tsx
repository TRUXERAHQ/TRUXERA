import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDriversForOrganization } from "@/src/prisma/operations-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import {
  Badge,
  buttonPrimaryClass,
  buttonSecondaryClass,
  EmptyState,
  labelClass,
  Notice,
  PageHeader,
  resourceStatusTone,
} from "../ui";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function DriversPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-8 text-slate-600">Loading drivers...</main>}>
      <DriversContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DriversContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  const drivers = await getDriversForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!drivers) notFound();

  const addHref = `/dashboard/drivers/new?${organizationQuery(context.organization.id)}`;

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="drivers">
      <PageHeader
        eyebrow="Fleet operations"
        title="Drivers"
        description="Maintain driver records and operational status."
        actions={
          context.canManage ? (
            <Link href={addHref} className={buttonPrimaryClass}>
              Add driver
            </Link>
          ) : undefined
        }
      />

      {context.created && (
        <div className="mt-5">
          <Notice tone="success">Driver added.</Notice>
        </div>
      )}

      {drivers.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No drivers yet"
            description="Add a driver before creating dispatch assignments."
            action={
              context.canManage ? (
                <Link href={addHref} className={buttonPrimaryClass}>
                  Add your first driver
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <section aria-label="Driver list" className="mt-8 grid gap-4 xl:grid-cols-2">
          {drivers.map((driver) => (
            <article key={driver.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-semibold">{driver.name}</h2>
                  <p className="mt-1 break-words text-sm text-slate-500">
                    {driver.licenseNumber ?? "License not recorded"}
                  </p>
                </div>
                <Badge tone={resourceStatusTone(driver.status)} className="shrink-0">
                  {driver.status.toLowerCase().replaceAll("_", " ")}
                </Badge>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <div>
                  <dt className={labelClass}>Phone</dt>
                  <dd className="mt-1 break-words text-sm">
                    {driver.phone ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Status</dt>
                  <dd className="mt-1 text-sm">
                    {driver.status.toLowerCase().replaceAll("_", " ")}
                  </dd>
                </div>
              </dl>
              <Link
                href={`/dashboard/drivers/${encodeURIComponent(driver.id)}?${organizationQuery(context.organization.id)}`}
                className={`${buttonSecondaryClass} mt-5`}
              >
                View driver
              </Link>
            </article>
          ))}
        </section>
      )}

      {!context.canManage && <p className="mt-6 text-xs text-slate-500">Your organization role allows driver viewing but not changes.</p>}
    </TruckShell>
  );
}
