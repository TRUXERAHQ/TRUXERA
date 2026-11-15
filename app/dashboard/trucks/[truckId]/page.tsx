import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTruckDetailsForOrganization } from "@/src/prisma/truck-data";
import { isUuid } from "@/src/trucks/truck-policy";
import TruckDeactivationForm from "../truck-deactivation-form";
import { canManageFleet, getTruckPageContext, type TruckPageSearchParams, firstTruckSearchValue } from "../truck-page-data";
import TruckShell from "../truck-shell";

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
        <Link
          href={`/dashboard/trucks?organizationId=${encodeURIComponent(context.organization.id)}${context.showArchived ? "&showArchived=true" : ""}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          ← Back to trucks
        </Link>

        {(context.notice || alert) && (
          <p
            role="status"
            className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
              alert
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {alert ? context.notice ?? "The truck could not be updated." : context.notice}
          </p>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Truck details
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                {truck.unitNumber}
              </h1>
              <span
                className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                  truck.deactivatedAt
                    ? "border-slate-300 bg-slate-100 text-slate-600"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {truck.deactivatedAt
                  ? "Archived"
                  : truck.status
                      .toLowerCase()
                      .split("_")
                      .map((word) => word[0].toUpperCase() + word.slice(1))
                      .join(" ")}
              </span>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-3">
                {!truck.deactivatedAt && (
                  <Link
                    href={`/dashboard/trucks/${encodeURIComponent(truck.id)}/edit?organizationId=${encodeURIComponent(context.organization.id)}`}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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

          <dl className="mt-8 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Vehicle identification number
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {truck.vin ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Rated capacity
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {truck.capacityKg === null
                  ? "Not set"
                  : `${new Intl.NumberFormat("en-US", {
                      maximumFractionDigits: 2,
                    }).format(Number(truck.capacityKg))} kg`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Current location
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {truck.currentLocation ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last updated
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {formatDate(truck.updatedAt, context.organization.timezone)}
              </dd>
            </div>
            {truck.deactivatedAt && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Removed from active fleet
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {formatDate(
                    truck.deactivatedAt,
                    context.organization.timezone,
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="font-semibold">Current assignment</h2>
            <p className="mt-1 text-sm text-slate-500">
              Assignment details come from the existing dispatch records.
            </p>
          </div>
          {assignments.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-600">
              This truck has no current assignment.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className="grid gap-4 px-6 py-5 sm:grid-cols-3"
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Load
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {assignment.delivery.load.reference}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {assignment.delivery.load.customerName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Driver
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {assignment.driver.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {assignment.driver.status
                        .toLowerCase()
                        .replaceAll("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Assigned
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {formatDate(
                        assignment.assignedAt,
                        context.organization.timezone,
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Delivery {assignment.delivery.reference ?? assignment.delivery.id}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-6 py-4">
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
