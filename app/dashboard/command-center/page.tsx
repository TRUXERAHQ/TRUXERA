import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import TruckShell from "../trucks/truck-shell";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../operations-page-data";
import { getDispatchBoardForOrganization } from "@/src/prisma/operations-data";
import { analyzeDeliveryRisksForOrganization } from "@/src/fleet/delivery-risk";
import {
  buildCommandCenter,
  parseCommandCenterFilters,
} from "@/src/dashboard/command-center";
import { deliveryStatuses } from "@/src/fleet/delivery-lifecycle";

type SearchParams = OperationsSearchParams & {
  q?: string | string[];
  risk?: string | string[];
  status?: string | string[];
  assignmentState?: string | string[];
  truckId?: string | string[];
  driverId?: string | string[];
  loadId?: string | string[];
  attention?: string | string[];
};

type Props = { searchParams: Promise<SearchParams> };

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function formatEventLabel(event: {
  type: string;
  toStatus: string | null;
  note: string | null;
}) {
  if (event.type === "ASSIGNMENT_CHANGED") {
    if (event.note?.toLowerCase().startsWith("reassigned from ")) {
      return "Reassignment";
    }
    if (event.note?.toLowerCase().startsWith("assigned to ")) {
      return "Assignment created";
    }
    return "Assignment changed";
  }
  if (event.type === "STATUS_CHANGED" && event.toStatus) {
    if (event.toStatus === "DELIVERED") return "Delivery completed";
    if (event.toStatus === "FAILED") return "Delivery failed";
    if (event.toStatus === "CANCELLED") return "Delivery cancelled";
    return `Status changed to ${formatLabel(event.toStatus)}`;
  }
  return formatLabel(event.type);
}

function dateLabel(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export default function CommandCenterPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading command center...
        </main>
      }
    >
      <CommandCenterContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CommandCenterContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  const board = await getDispatchBoardForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!board) notFound();

  const organizationId = context.organization.id;
  const analyzedAt = new Date();
  const filters = parseCommandCenterFilters(params);
  const activeAssignments = board.assignments.filter(
    (assignment) => assignment.endedAt === null,
  );
  const riskAssignments = board.assignments.flatMap((assignment) =>
    assignment.delivery
      ? [{
          id: assignment.id,
          organizationId: assignment.organizationId,
          deliveryId: assignment.deliveryId,
          truckId: assignment.truckId,
          driverId: assignment.driverId,
          endedAt: assignment.endedAt,
          endReason: assignment.endReason,
          truck: assignment.truck,
          driver: assignment.driver,
          delivery: {
            organizationId: assignment.delivery.organizationId,
            loadId: assignment.delivery.loadId,
          },
        }]
      : [],
  );
  const analyses = analyzeDeliveryRisksForOrganization({
    organizationId,
    analyzedAt,
    deliveries: board.deliveries.map((delivery) => ({
      ...delivery,
      load: { weightKg: delivery.load.weightKg },
    })),
    trucks: board.trucks.map((truck) => ({
      id: truck.id,
      organizationId: truck.organizationId,
      unitNumber: truck.unitNumber,
      status: truck.status,
      deactivatedAt: truck.deactivatedAt,
      capacityKg: truck.capacityKg === null ? null : Number(truck.capacityKg),
    })),
    drivers: board.drivers.map((driver) => ({
      id: driver.id,
      organizationId: driver.organizationId,
      name: driver.name,
      status: driver.status,
    })),
    assignments: riskAssignments,
    events: board.events,
  }).map(({ deliveryId, analysis }) => ({
    organizationId,
    deliveryId,
    analysis,
  }));
  const result = buildCommandCenter({
    organizationId,
    now: analyzedAt,
    filters,
    deliveries: board.deliveries,
    assignments: activeAssignments.flatMap((assignment) =>
      assignment.delivery
        ? [{
            id: assignment.id,
            organizationId: assignment.organizationId,
            deliveryId: assignment.deliveryId,
            endedAt: assignment.endedAt,
            truck: assignment.truck,
            driver: assignment.driver,
            delivery: { organizationId: assignment.delivery.organizationId },
          }]
        : [],
    ),
    events: board.events,
    analyses,
  });
  const loads = Array.from(
    new Map(
      board.deliveries.map((delivery) => [
        delivery.loadId,
        { id: delivery.loadId, reference: delivery.load.reference },
      ]),
    ).values(),
  ).sort((left, right) => left.reference.localeCompare(right.reference));

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="command-center"
    >
      <div>
        <p className="text-sm font-medium text-slate-500">Fleet operations</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Dispatcher Command Center
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Prioritized operational issues and actions across your fleet.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Risk is deterministic and evidence-backed; it is not an AI or ETA
          prediction.
        </p>
      </div>

      <section
        aria-label="Operational summary"
        className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {[
          ["Requires attention", result.summary.requiresAttention],
          ["High risk", result.summary.highRisk],
          ["Medium risk", result.summary.mediumRisk],
          ["Active assignments", result.summary.activeAssignments],
          ["Open deliveries", result.summary.openDeliveries],
        ].map(([label, count]) => (
          <article
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{count}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Filter operational work</h2>
        <form
          action="/dashboard/command-center"
          method="get"
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            type="hidden"
            name="organizationId"
            value={organizationId}
          />
          <label className="text-xs font-medium text-slate-600">
            Search delivery, load, or customer
            <input
              name="q"
              defaultValue={filters.query}
              maxLength={100}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Risk
            <select
              name="risk"
              defaultValue={filters.risk}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ANY">Any risk</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="INSUFFICIENT_DATA">Insufficient data</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Delivery status
            <select
              name="status"
              defaultValue={filters.status}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ANY">Any status</option>
              {deliveryStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Assignment
            <select
              name="assignmentState"
              defaultValue={filters.assignmentState}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ANY">Any assignment</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNASSIGNED">Unassigned</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Truck
            <select
              name="truckId"
              defaultValue={params.truckId?.toString() ?? ""}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Any truck</option>
              {board.trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.unitNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Driver
            <select
              name="driverId"
              defaultValue={params.driverId?.toString() ?? ""}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Any driver</option>
              {board.drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Load
            <select
              name="loadId"
              defaultValue={params.loadId?.toString() ?? ""}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Any load</option>
              {loads.map((load) => (
                <option key={load.id} value={load.id}>
                  {load.reference}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Attention
            <select
              name="attention"
              defaultValue={params.attention?.toString() ?? ""}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="1">Requires attention</option>
              <option value="0">Monitor only</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Apply filters
            </button>
            <Link
              href={`/dashboard/command-center?${organizationQuery(organizationId)}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
        <section aria-label="Prioritized attention queue">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Attention queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                {result.items.length} of {result.totalItems} operational item
                {result.totalItems === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {result.summary.requiresAttention === 0 && (
            <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              There are no current issues requiring attention.
            </p>
          )}
          {result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-600">
              No operational items match these filters.
            </div>
          ) : (
            <div className="space-y-4">
              {result.items.map((item) => {
                const recommendation = item.risk.intervention.recommended;
                const candidate = item.risk.reassignmentCandidates.find(
                  (entry) =>
                    entry.truckId === recommendation?.truckId &&
                    entry.driverId === recommendation?.driverId,
                );
                return (
                  <article
                    key={item.deliveryId}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {item.loadReference} · {item.deliveryReference}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold">
                          {item.customerName}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.destinationAddress}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700">
                          {formatLabel(item.status)}
                        </span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold capitalize text-amber-900">
                          {item.risk.riskLevel
                            ? `${formatLabel(item.risk.riskLevel)} risk`
                            : "Insufficient risk data"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <p>
                        <span className="text-slate-500">Current resources: </span>
                        {item.assignment
                          ? `Truck ${item.assignment.truckUnitNumber} · ${item.assignment.driverName}`
                          : "No active truck/driver assignment"}
                      </p>
                      <p>
                        <span className="text-slate-500">Assignment state: </span>
                        {formatLabel(item.assignmentState)}
                        {!item.activeWork && " · terminal"}
                      </p>
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-700">
                        Deterministic operational analysis, not an AI prediction
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                        {item.risk.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      {item.risk.limitations.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-800">
                          {item.risk.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {item.risk.riskLevel === "LOW" && (
                      <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        🟢 Risk: Low — No recovery action required. Delivery is
                        operating normally; no unresolved operational issue
                        requires dispatcher intervention.
                      </p>
                    )}
                    {recommendation &&
                      (item.risk.riskLevel === "MEDIUM" ||
                        item.risk.riskLevel === "HIGH") && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-sm text-emerald-900">
                          {item.risk.riskLevel === "HIGH"
                            ? "🔴 Recovery action recommended. "
                            : "🟠 Recovery action may be required. "}
                          Recommended: Truck {recommendation.truckUnitNumber} ·{" "}
                          {recommendation.driverName}
                          {candidate &&
                            ` · ${candidate.capacityUtilizationPercent}% capacity utilized`}
                        </p>
                        <Link
                          href={`/dashboard/dispatch?${organizationQuery(organizationId)}#delivery-${item.deliveryId}`}
                          className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          Review recovery
                        </Link>
                      </div>
                    )}
                    {!recommendation &&
                      item.risk.intervention.insufficientReassignmentDataCount >
                        0 && (
                        <p className="mt-3 text-xs text-amber-800">
                          No alternative is offered because capacity or other
                          required eligibility evidence is insufficient.
                        </p>
                      )}

                    {item.recentEvents.length > 0 && (
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <p className="text-xs font-semibold text-slate-600">
                          Recent delivery history
                        </p>
                        <ul className="mt-2 space-y-2">
                          {item.recentEvents.map((event) => (
                            <li
                              key={event.id}
                              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-slate-600"
                            >
                              <span>
                                {formatEventLabel(event)}{" "}
                                {event.note && `· ${event.note}`}
                              </span>
                              <time dateTime={event.occurredAt.toISOString()}>
                                {dateLabel(
                                  event.occurredAt,
                                  context.organization.timezone,
                                )}
                              </time>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside>
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">Recent operational activity</h2>
              <p className="mt-1 text-xs text-slate-500">
                Latest assignment and delivery events
              </p>
            </div>
            {result.recentEvents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                No operational events recorded.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {result.recentEvents.map((event) => (
                  <li key={event.id} className="px-5 py-4">
                    <p className="text-sm font-medium">
                      {formatEventLabel(event)}
                    </p>
                    {event.note && (
                      <p className="mt-1 text-xs text-slate-600">
                        {event.note}
                      </p>
                    )}
                    <time
                      dateTime={event.occurredAt.toISOString()}
                      className="mt-2 block text-xs text-slate-500"
                    >
                      {dateLabel(event.occurredAt, context.organization.timezone)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {!context.canManage && (
            <p className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
              Your organization role allows operational viewing but not
              assignment changes.
            </p>
          )}
        </aside>
      </div>
    </TruckShell>
  );
}
