import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrucksForOrganization } from "@/src/prisma/truck-data";
import { canManageFleet, getTruckPageContext, type TruckPageSearchParams } from "./truck-page-data";
import TruckShell from "./truck-shell";

type Props = {
  searchParams: Promise<TruckPageSearchParams>;
};

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatKg(value: number | string | null) {
  if (value === null) return "Not set";
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value))} kg`;
}

function capacityUtilization(
  capacityKg: number | string | null,
  assignments: Array<{
    delivery: { load: { weightKg: number | string | null } };
  }>,
) {
  if (capacityKg === null || assignments.length !== 1) return null;

  const weight = assignments[0].delivery.load.weightKg;
  if (weight === null) return null;

  const capacity = Number(capacityKg);
  if (capacity <= 0) return null;

  return Math.round((Number(weight) / capacity) * 100);
}

export default function TrucksPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading fleet...
        </main>
      }
    >
      <TrucksContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TrucksContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getTruckPageContext(params);
  const fleet = await getTrucksForOrganization(
    context.userId,
    context.organization.id,
    context.showArchived,
  );
  if (!fleet) notFound();

  const canManage = canManageFleet(context.membership.role);
  const assignmentsByTruckId = new Map<string, typeof fleet.assignments>();
  for (const assignment of fleet.assignments) {
    const assignments = assignmentsByTruckId.get(assignment.truckId) ?? [];
    assignments.push(assignment);
    assignmentsByTruckId.set(assignment.truckId, assignments);
  }
  const addTruckHref = `/dashboard/trucks/new?organizationId=${encodeURIComponent(context.organization.id)}`;
  const archiveHref = context.showArchived
    ? `/dashboard/trucks?organizationId=${encodeURIComponent(context.organization.id)}`
    : `/dashboard/trucks?organizationId=${encodeURIComponent(context.organization.id)}&showArchived=true`;

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
    >
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">Fleet management</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Trucks</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage registered vehicles and review their current assignments.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={archiveHref}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {context.showArchived ? "Show active fleet" : "View archived"}
          </Link>
          {canManage && (
            <Link
              href={addTruckHref}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Add Truck
            </Link>
          )}
        </div>
      </div>

      {context.showArchived && (
        <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Archived trucks are shown with their preserved records. They are
          excluded from the active fleet and dashboard metrics.
        </p>
      )}

      {fleet.trucks.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto max-w-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700">
              +
            </div>
            <h2 className="mt-4 text-xl font-semibold">
              {context.showArchived ? "No trucks to show" : "Your fleet is ready to start"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {context.showArchived
                ? "There are no truck records in this organization."
                : "Add your organization's first truck to begin tracking fleet capacity and operational status."}
            </p>
            {canManage && !context.showArchived && (
              <Link
                href={addTruckHref}
                className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Add your first truck
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section
          aria-label="Truck list"
          className="mt-8 grid gap-4 xl:grid-cols-2"
        >
          {fleet.trucks.map((truck) => {
            const assignments = assignmentsByTruckId.get(truck.id) ?? [];
            const utilization = capacityUtilization(
              truck.capacityKg,
              assignments,
            );
            const detailHref = `/dashboard/trucks/${encodeURIComponent(truck.id)}?organizationId=${encodeURIComponent(context.organization.id)}`;

            return (
              <article
                key={truck.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{truck.unitNumber}</h2>
                      {truck.deactivatedAt ? (
                        <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          Archived
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {formatLabel(truck.status)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {truck.vin ? `VIN ${truck.vin}` : "VIN not recorded"}
                    </p>
                  </div>
                  <Link
                    href={detailHref}
                    className="inline-flex shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View details
                  </Link>
                </div>

                <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Capacity
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {formatKg(truck.capacityKg)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Current location
                    </dt>
                    <dd className="mt-1 truncate text-sm font-medium">
                      {truck.currentLocation ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Assigned driver
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {assignments.length
                        ? assignments.map(({ driver }) => driver.name).join(", ")
                        : "No active driver"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Current load
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {assignments.length
                        ? assignments
                            .map(({ delivery }) => delivery.load.reference)
                            .join(", ")
                        : "No active assignment"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Capacity utilization</span>
                    <span className="font-medium">
                      {utilization === null
                        ? "Not available"
                        : `${utilization}%`}
                    </span>
                  </div>
                  {utilization !== null && (
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={`Capacity utilization for truck ${truck.unitNumber}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.max(0, Math.min(utilization, 100))}
                    >
                      <div
                        className={`h-full rounded-full ${
                          utilization > 100 ? "bg-red-500" : "bg-blue-600"
                        }`}
                        style={{
                          width: `${Math.max(0, Math.min(utilization, 100))}%`,
                        }}
                      />
                    </div>
                  )}
                  {utilization !== null && utilization > 100 && (
                    <p className="mt-2 text-xs font-medium text-red-700">
                      Assigned load weight exceeds listed capacity.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {!canManage && (
        <p className="mt-6 text-xs text-slate-500">
          Your organization role allows fleet viewing but not truck changes.
        </p>
      )}
    </TruckShell>
  );
}
