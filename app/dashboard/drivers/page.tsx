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

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function DriversPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading drivers...</main>}>
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
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">Fleet operations</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Drivers</h1>
          <p className="mt-2 text-sm text-slate-600">Maintain driver records and operational status.</p>
        </div>
        {context.canManage && (
          <Link href={addHref} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
            Add driver
          </Link>
        )}
      </div>

      {context.created && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Driver added.</p>}

      {drivers.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">No drivers yet</h2>
          <p className="mt-2 text-sm text-slate-600">Add a driver before creating dispatch assignments.</p>
          {context.canManage && <Link href={addHref} className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">Add your first driver</Link>}
        </section>
      ) : (
        <section aria-label="Driver list" className="mt-8 grid gap-4 xl:grid-cols-2">
          {drivers.map((driver) => (
            <article key={driver.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{driver.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{driver.licenseNumber ?? "License not recorded"}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {driver.status.toLowerCase().replaceAll("_", " ")}
                </span>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt><dd className="mt-1 text-sm">{driver.phone ?? "Not recorded"}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt><dd className="mt-1 text-sm">{driver.status.toLowerCase().replaceAll("_", " ")}</dd></div>
              </dl>
              <Link href={`/dashboard/drivers/${encodeURIComponent(driver.id)}?${organizationQuery(context.organization.id)}`} className="mt-5 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
