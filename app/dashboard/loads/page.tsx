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
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">Fleet operations</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Loads & deliveries</h1>
          <p className="mt-2 text-sm text-slate-600">Create customer loads with one or more delivery stops.</p>
        </div>
        {context.canManage && <Link href={addHref} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">Create load</Link>}
      </div>

      {result.loads.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">No loads yet</h2>
          <p className="mt-2 text-sm text-slate-600">Create a load and add its delivery stops before assigning a truck and driver.</p>
          {context.canManage && <Link href={addHref} className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">Create your first load</Link>}
        </section>
      ) : (
        <section aria-label="Load list" className="mt-8 space-y-3">
          {result.loads.map((load) => (
            <article key={load.id} className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold">{load.reference}</h2>
                <p className="mt-1 text-sm text-slate-500">{load.customerName} · {load.pickupAddress}</p>
                <p className="mt-1 text-xs text-slate-500">{deliveryCountByLoad.get(load.id) ?? 0} delivery stops</p>
              </div>
              <Link href={`/dashboard/loads/${encodeURIComponent(load.id)}?${organizationQuery(context.organization.id)}`} className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                View load
              </Link>
            </article>
          ))}
        </section>
      )}
    </TruckShell>
  );
}
