import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoadsForOrganization } from "@/src/prisma/operations-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  EmptyState,
  PageHeader,
} from "../ui";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function LoadsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading loads...</main>}>
      <LoadsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoadsContent({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams);
  const result = await getLoadsForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!result) notFound();

  const addHref = `/dashboard/loads/new?${organizationQuery(context.organization.id)}`;
  const deliveryCountByLoad = new Map<string, number>();
  for (const delivery of result.deliveries) {
    deliveryCountByLoad.set(
      delivery.loadId,
      (deliveryCountByLoad.get(delivery.loadId) ?? 0) + 1,
    );
  }

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="loads">
      <PageHeader
        eyebrow="Fleet operations"
        title="Loads & deliveries"
        description="Create customer loads with one or more delivery stops."
        actions={
          context.canManage ? (
            <Link href={addHref} className={buttonPrimaryClass}>
              Create load
            </Link>
          ) : undefined
        }
      />

      {result.loads.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No loads yet"
            description="Create a load and add its delivery stops before assigning a truck and driver."
            action={
              context.canManage ? (
                <Link href={addHref} className={buttonPrimaryClass}>
                  Create your first load
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <section aria-label="Load list" className="mt-8 space-y-3">
          {result.loads.map((load) => (
            <article key={load.id} className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold">{load.reference}</h2>
                <p className="mt-1 break-words text-sm text-slate-500">{load.customerName} · {load.pickupAddress}</p>
                <p className="mt-1 text-xs text-slate-500">{deliveryCountByLoad.get(load.id) ?? 0} delivery stops</p>
              </div>
              <Link
                href={`/dashboard/loads/${encodeURIComponent(load.id)}?${organizationQuery(context.organization.id)}`}
                className={`${buttonSecondaryClass} shrink-0`}
              >
                View load
              </Link>
            </article>
          ))}
        </section>
      )}
    </TruckShell>
  );
}
