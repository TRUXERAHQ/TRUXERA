import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/src/trucks/truck-policy";
import { getDriverDetailsForOrganization } from "@/src/prisma/operations-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../operations-page-data";
import TruckShell from "../../trucks/truck-shell";

type Props = {
  params: Promise<{ driverId: string }>;
  searchParams: Promise<OperationsSearchParams>;
};

function formatDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}

export default function DriverDetailsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading driver details...</main>}>
      <DriverDetailsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DriverDetailsContent({ params, searchParams }: Props) {
  const [{ driverId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(driverId)) notFound();

  const context = await getOperationsPageContext(query);
  const details = await getDriverDetailsForOrganization(
    context.userId,
    context.organization.id,
    driverId,
  );
  if (!details) notFound();

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="drivers">
      <div className="mx-auto max-w-4xl">
        <Link href={`/dashboard/drivers?${organizationQuery(context.organization.id)}`} className="text-sm font-medium text-slate-600 hover:text-slate-950">
          ← Back to drivers
        </Link>

        {(context.created || context.updated) && (
          <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {context.created ? "Driver added." : "Driver details saved."}
          </p>
        )}
        {context.hasError && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">The driver operation could not be completed.</p>}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Driver details</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{details.driver.name}</h1>
              <span className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                {details.driver.status.toLowerCase().replaceAll("_", " ")}
              </span>
            </div>
            {context.canManage && (
              <Link href={`/dashboard/drivers/${encodeURIComponent(driverId)}/edit?${organizationQuery(context.organization.id)}`} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Edit driver
              </Link>
            )}
          </div>

          <dl className="mt-8 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt><dd className="mt-1 text-sm font-medium">{details.driver.phone ?? "Not recorded"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">License number</dt><dd className="mt-1 text-sm font-medium">{details.driver.licenseNumber ?? "Not recorded"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last updated</dt><dd className="mt-1 text-sm font-medium">{formatDate(details.driver.updatedAt, context.organization.timezone)}</dd></div>
          </dl>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="font-semibold">Current assignments</h2>
            <p className="mt-1 text-sm text-slate-500">Only active dispatch records for this organization are shown.</p>
          </div>
          {details.assignments.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-600">This driver has no current assignments.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {details.assignments.map((assignment) => (
                <li key={assignment.id} className="grid gap-4 px-6 py-5 sm:grid-cols-3">
                  <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Load / stop</p><p className="mt-1 text-sm font-semibold">{assignment.delivery.load.reference} · Stop {assignment.delivery.stopNumber}</p><p className="mt-1 text-xs text-slate-500">{assignment.delivery.destinationAddress}</p></div>
                  <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Truck</p><p className="mt-1 text-sm font-semibold">{assignment.truck.unitNumber}</p></div>
                  <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Assigned</p><p className="mt-1 text-sm font-semibold">{formatDate(assignment.assignedAt, context.organization.timezone)}</p></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </TruckShell>
  );
}
