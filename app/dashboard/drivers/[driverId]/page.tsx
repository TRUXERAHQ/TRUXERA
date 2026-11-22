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
import {
  BackLink,
  Badge,
  buttonSecondaryClass,
  labelClass,
  Notice,
  resourceStatusTone,
} from "../../ui";

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
    <Suspense fallback={<main className="min-h-screen bg-background p-8 text-slate-600">Loading driver details...</main>}>
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
        <BackLink href={`/dashboard/drivers?${organizationQuery(context.organization.id)}`}>
          Back to drivers
        </BackLink>

        {(context.created || context.updated) && (
          <div className="mt-5">
            <Notice tone="success">
              {context.created ? "Driver added." : "Driver details saved."}
            </Notice>
          </div>
        )}
        {context.hasError && (
          <div className="mt-5">
            <Notice tone="danger">
              The driver operation could not be completed.
            </Notice>
          </div>
        )}

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">Driver details</p>
              <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {details.driver.name}
              </h1>
              <Badge
                tone={resourceStatusTone(details.driver.status)}
                className="mt-3"
              >
                {details.driver.status.toLowerCase().replaceAll("_", " ")}
              </Badge>
            </div>
            {context.canManage && (
              <Link
                href={`/dashboard/drivers/${encodeURIComponent(driverId)}/edit?${organizationQuery(context.organization.id)}`}
                className={buttonSecondaryClass}
              >
                Edit driver
              </Link>
            )}
          </div>

          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <dt className={labelClass}>Phone</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-800">
                {details.driver.phone ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>License number</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-800">
                {details.driver.licenseNumber ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Last updated</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {formatDate(details.driver.updatedAt, context.organization.timezone)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-white px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500" />
              Current assignments
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Only active dispatch records for this organization are shown.
            </p>
          </div>
          {details.assignments.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-600">
              This driver has no current assignments.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {details.assignments.map((assignment) => (
                <li key={assignment.id} className="grid gap-4 px-5 py-5 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className={labelClass}>Load / stop</p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                      {assignment.delivery.load.reference} · Stop {assignment.delivery.stopNumber}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {assignment.delivery.destinationAddress}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className={labelClass}>Truck</p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                      {assignment.truck.unitNumber}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className={labelClass}>Assigned</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatDate(assignment.assignedAt, context.organization.timezone)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </TruckShell>
  );
}
