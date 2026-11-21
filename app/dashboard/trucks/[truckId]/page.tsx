import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTruckDetailsForOrganization } from "@/src/prisma/truck-data";
import { isUuid } from "@/src/trucks/truck-policy";
import TruckDeactivationForm from "../truck-deactivation-form";
import { canManageFleet, getTruckPageContext, type TruckPageSearchParams, firstTruckSearchValue } from "../truck-page-data";
import TruckShell from "../truck-shell";
import {
  BackLink,
  Badge,
  buttonSecondaryClass,
  labelClass,
  Notice,
  resourceStatusTone,
} from "../../ui";

type Props = {
  params: Promise<{ truckId: string }>;
  searchParams: Promise<TruckPageSearchParams>;
};

function formatDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}

export default function TruckDetailsPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading truck details...
        </main>
      }
    >
      <TruckDetailsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TruckDetailsContent({ params, searchParams }: Props) {
  const [{ truckId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(truckId)) notFound();
  const context = await getTruckPageContext(query);
  const details = await getTruckDetailsForOrganization(
    context.userId,
    context.organization.id,
    truckId,
  );
  if (!details) notFound();

  const { truck, assignments } = details;
  const canManage = canManageFleet(context.membership.role);
  const alert = firstTruckSearchValue(query.error);
  const assignedWeight =
    assignments.length === 1 ? assignments[0].delivery.load.weightKg : null;
  const utilization =
    assignedWeight !== null &&
    truck.capacityKg !== null &&
    Number(truck.capacityKg) > 0
      ? Math.round((Number(assignedWeight) / Number(truck.capacityKg)) * 100)
      : null;

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
    >
      <div className="mx-auto max-w-4xl">
        <BackLink
          href={`/dashboard/trucks?organizationId=${encodeURIComponent(context.organization.id)}${context.showArchived ? "&showArchived=true" : ""}`}
        >
          Back to trucks
        </BackLink>

        {(context.notice || alert) && (
          <div className="mt-5">
            <Notice tone={alert ? "danger" : "success"}>
              {alert ? context.notice ?? "The truck could not be updated." : context.notice}
            </Notice>
          </div>
        )}

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">
                Truck details
              </p>
              <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {truck.unitNumber}
              </h1>
              {truck.deactivatedAt ? (
                <Badge tone="neutral" className="mt-3">
                  Archived
                </Badge>
              ) : (
                <Badge
                  tone={resourceStatusTone(truck.status)}
                  className="mt-3"
                >
                  {truck.status
                    .toLowerCase()
                    .split("_")
                    .map((word) => word[0].toUpperCase() + word.slice(1))
                    .join(" ")}
                </Badge>
              )}
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {!truck.deactivatedAt && (
                  <Link
                    href={`/dashboard/trucks/${encodeURIComponent(truck.id)}/edit?organizationId=${encodeURIComponent(context.organization.id)}`}
                    className={buttonSecondaryClass}
                  >
                    Edit truck
                  </Link>
                )}
                <TruckDeactivationForm
                  organizationId={context.organization.id}
                  truckId={truck.id}
                  deactivated={truck.deactivatedAt !== null}
                />
              </div>
            )}
          </div>

          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <dt className={labelClass}>
                Vehicle identification number
              </dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-800">
                {truck.vin ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Rated capacity</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {truck.capacityKg === null
                  ? "Not set"
                  : `${new Intl.NumberFormat("en-US", {
                      maximumFractionDigits: 2,
                    }).format(Number(truck.capacityKg))} kg`}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Current location</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-800">
                {truck.currentLocation ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Last updated</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {formatDate(truck.updatedAt, context.organization.timezone)}
              </dd>
            </div>
            {truck.deactivatedAt && (
              <div>
                <dt className={labelClass}>
                  Removed from active fleet
                </dt>
                <dd className="mt-1 text-sm font-medium text-slate-800">
                  {formatDate(
                    truck.deactivatedAt,
                    context.organization.timezone,
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Current assignment
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Assignment details come from the existing dispatch records.
            </p>
          </div>
          {assignments.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-600">
              This truck has no current assignment.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className="grid gap-4 px-5 py-5 sm:grid-cols-3"
                >
                  <div className="min-w-0">
                    <p className={labelClass}>Load</p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                      {assignment.delivery.load.reference}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {assignment.delivery.load.customerName}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className={labelClass}>Driver</p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                      {assignment.driver.name}
                    </p>
                    <Badge
                      tone={resourceStatusTone(assignment.driver.status)}
                      className="mt-1"
                    >
                      {assignment.driver.status
                        .toLowerCase()
                        .replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <div className="min-w-0">
                    <p className={labelClass}>Assigned</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatDate(
                        assignment.assignedAt,
                        context.organization.timezone,
                      )}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      Delivery {assignment.delivery.reference ?? assignment.delivery.id}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-sm text-slate-600">
              Capacity utilization:{" "}
              <span className="font-semibold">
                {utilization === null ? "Not available" : `${utilization}%`}
              </span>
              {utilization === null &&
                assignments.length > 0 &&
                " because this record does not support a reliable single-load calculation."}
            </p>
          </div>
        </section>
      </div>
    </TruckShell>
  );
}
