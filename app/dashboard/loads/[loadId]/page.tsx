import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/src/trucks/truck-policy";
import {
  getAllowedDeliveryStatusTransitions,
} from "@/src/fleet/delivery-lifecycle";
import { analyzeDeliveryRisksForOrganization } from "@/src/fleet/delivery-risk";
import { getLoadDetailsForOrganization } from "@/src/prisma/operations-data";
import DeliveryStatusForm from "../delivery-status-form";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../operations-page-data";
import TruckShell from "../../trucks/truck-shell";

type Props = {
  params: Promise<{ loadId: string }>;
  searchParams: Promise<OperationsSearchParams>;
};

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function getEventTitle(event: {
  type: string;
  toStatus: string | null;
  note: string | null;
}) {
  if (event.type === "ASSIGNMENT_CHANGED") {
    if (event.note?.startsWith("Reassigned")) return "Reassignment";
    if (event.note?.startsWith("Active assignment ended")) {
      return "Assignment ended";
    }
    return "Assignment change";
  }
  if (event.type === "STATUS_CHANGED") {
    if (event.toStatus === "DELIVERED") return "Delivery completed";
    if (event.toStatus === "FAILED") return "Delivery failed";
    if (event.toStatus === "CANCELLED") return "Delivery cancelled";
    return "Status change";
  }
  return formatLabel(event.type);
}

export default function LoadDetailsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading load details...</main>}>
      <LoadDetailsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LoadDetailsContent({ params, searchParams }: Props) {
  const [{ loadId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(loadId)) notFound();

  const context = await getOperationsPageContext(query);
  const details = await getLoadDetailsForOrganization(
    context.userId,
    context.organization.id,
    loadId,
  );
  if (!details) notFound();

  const assignmentsByDeliveryId = new Map(
    details.assignments
      .filter((assignment) => assignment.endedAt === null)
      .map((assignment) => [assignment.deliveryId, assignment]),
  );
  const eventsByDeliveryId = new Map<string, typeof details.events>();
  for (const event of details.events) {
    const events = eventsByDeliveryId.get(event.deliveryId) ?? [];
    events.push(event);
    eventsByDeliveryId.set(event.deliveryId, events);
  }
  const riskAssignmentsById = new Map(
    details.assignments.map((assignment) => [
      assignment.id,
      {
        ...assignment,
        delivery: {
          organizationId: context.organization.id,
          loadId: details.load.id,
        },
      },
    ]),
  );
  for (const assignment of details.organizationActiveAssignments) {
    if (assignment.delivery) {
      riskAssignmentsById.set(assignment.id, {
        ...assignment,
        delivery: {
          organizationId: assignment.delivery.organizationId,
          loadId: assignment.delivery.loadId,
        },
      });
    }
  }
  const riskAnalyses = new Map(
    analyzeDeliveryRisksForOrganization({
      organizationId: context.organization.id,
      analyzedAt: new Date(),
      deliveries: details.deliveries.map((delivery) => ({
        ...delivery,
        load: { weightKg: details.load.weightKg },
      })),
      trucks: details.organizationTrucks.map((truck) => ({
        id: truck.id,
        organizationId: truck.organizationId,
        unitNumber: truck.unitNumber,
        status: truck.status,
        deactivatedAt: truck.deactivatedAt,
        capacityKg:
          truck.capacityKg === null ? null : Number(truck.capacityKg),
      })),
      drivers: details.organizationDrivers.map((driver) => ({
        id: driver.id,
        organizationId: driver.organizationId,
        name: driver.name,
        status: driver.status,
      })),
      assignments: [...riskAssignmentsById.values()],
      events: details.events,
    }).map(({ deliveryId, analysis }) => [deliveryId, analysis] as const),
  );

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="loads">
      <div className="mx-auto max-w-5xl">
        <Link href={`/dashboard/loads?${organizationQuery(context.organization.id)}`} className="text-sm font-medium text-slate-600 hover:text-slate-950">
          ← Back to loads
        </Link>
        {(context.created || context.updated || context.statusUpdated) && (
          <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {context.created
              ? "Load and delivery stops created."
              : context.statusUpdated
                ? "Delivery status updated and recorded in event history."
                : "Load details updated."}
          </p>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Load details</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{details.load.reference}</h1>
              <p className="mt-2 text-sm text-slate-600">{details.load.customerName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {context.canManage && (
                <Link
                  href={`/dashboard/loads/${encodeURIComponent(loadId)}/edit?${organizationQuery(context.organization.id)}`}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit safe details
                </Link>
              )}
              <Link href={`/dashboard/dispatch?${organizationQuery(context.organization.id)}`} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
                Open dispatch
              </Link>
            </div>
          </div>
          <dl className="mt-8 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Pickup address</dt><dd className="mt-1 text-sm font-medium">{details.load.pickupAddress}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Load weight</dt><dd className="mt-1 text-sm font-medium">{details.load.weightKg === null ? "Not recorded" : `${Number(details.load.weightKg).toLocaleString()} kg`}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Cargo</dt><dd className="mt-1 text-sm font-medium">{details.load.cargoDescription ?? "Not recorded"}</dd></div>
          </dl>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="font-semibold">Delivery stops</h2>
            <p className="mt-1 text-sm text-slate-500">Status, risk, ETA, and assignments come from the stored delivery and dispatch records.</p>
          </div>
          {details.deliveries.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-600">This load has no delivery stops.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {details.deliveries.map((delivery) => {
                const assignment = assignmentsByDeliveryId.get(delivery.id);
                const events = eventsByDeliveryId.get(delivery.id) ?? [];
                const risk = riskAnalyses.get(delivery.id);
                const statusTransitions =
                  getAllowedDeliveryStatusTransitions(delivery.status);
                return (
                  <li key={delivery.id} className="px-6 py-5">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Stop {delivery.stopNumber}</p><p className="mt-1 text-sm font-semibold">{delivery.reference ?? details.load.reference}</p><p className="mt-1 text-xs text-slate-500">{delivery.recipientName ?? "Recipient not recorded"}</p></div>
                      <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Destination</p><p className="mt-1 text-sm">{delivery.destinationAddress}</p></div>
                      <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status / risk</p><p className="mt-1 text-sm font-medium capitalize">{formatLabel(delivery.status)} · {formatLabel(delivery.riskLevel)} risk</p><p className="mt-1 text-xs text-slate-500">ETA: {delivery.eta ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: context.organization.timezone }).format(delivery.eta) : "Not set"}</p><p className="mt-1 text-xs text-slate-500">Load weight: {details.load.weightKg === null ? "Not recorded" : `${Number(details.load.weightKg).toLocaleString()} kg`}</p></div>
                      <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current assignment</p><p className="mt-1 text-sm font-medium">{assignment ? `Truck ${assignment.truck.unitNumber} · ${assignment.driver.name}` : "Unassigned"}</p></div>
                    </div>

                    {risk && (
                      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">
                              Deterministic risk analysis
                            </h3>
                            <p className="mt-1 text-xs text-slate-600">
                              Risk {risk.riskLevel ? formatLabel(risk.riskLevel) : "insufficient data"} · Stored risk {formatLabel(risk.storedRiskLevel)}
                            </p>
                          </div>
                          {risk.intervention.action && (
                            <Link
                              href={`/dashboard/dispatch?${organizationQuery(context.organization.id)}`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {risk.intervention.action}
                            </Link>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Explainable operational analysis, not an AI prediction.
                        </p>
                        <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-slate-700">
                          {risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                        {risk.evidence.length > 0 && (
                          <p className="mt-3 text-xs text-slate-500">
                            Evidence: {risk.evidence.join(" ")}
                          </p>
                        )}
                        {risk.limitations.length > 0 && (
                          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-800">
                            {risk.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                          </ul>
                        )}
                        {risk.intervention.eligibleReassignmentCount > 0 && (
                          <p className="mt-3 text-xs text-slate-600">
                            {risk.intervention.eligibleReassignmentCount} eligible reassignment candidate(s) found.
                            {risk.intervention.recommended
                              ? ` Suggested: Truck ${risk.intervention.recommended.truckUnitNumber} · ${risk.intervention.recommended.driverName}.`
                              : ""}
                            {" "}A dispatcher must approve any reassignment.
                          </p>
                        )}
                      </div>
                    )}

                    {context.canManage && statusTransitions.length > 0 && (
                      <DeliveryStatusForm
                        organizationId={context.organization.id}
                        deliveryId={delivery.id}
                        currentStatus={delivery.status}
                        choices={statusTransitions}
                      />
                    )}
                    {statusTransitions.length === 0 && (
                      <p className="mt-4 text-xs text-slate-500">
                        This delivery is in a terminal status; no further
                        transitions are allowed.
                      </p>
                    )}
                    {!context.canManage && statusTransitions.length > 0 && (
                      <p className="mt-4 text-xs text-slate-500">
                        Your role allows delivery history viewing only.
                      </p>
                    )}

                    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-800">
                        Operational history
                      </h3>
                      {events.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">
                          No delivery events recorded.
                        </p>
                      ) : (
                        <ol className="mt-3 space-y-3">
                          {events.map((event) => (
                            <li
                              key={event.id}
                              className="border-l-2 border-slate-200 pl-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium text-slate-800">
                                  {getEventTitle(event)}
                                </span>
                                <time
                                  dateTime={event.occurredAt.toISOString()}
                                  className="text-xs text-slate-500"
                                >
                                  {new Intl.DateTimeFormat("en-US", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                    timeZone: context.organization.timezone,
                                  }).format(event.occurredAt)}
                                </time>
                              </div>
                              {event.fromStatus || event.toStatus ? (
                                <p className="mt-1 text-xs capitalize text-slate-500">
                                  {event.fromStatus
                                    ? formatLabel(event.fromStatus)
                                    : "Initial"}{" "}
                                  → {event.toStatus
                                    ? formatLabel(event.toStatus)
                                    : "—"}
                                </p>
                              ) : null}
                              {event.note && (
                                <p className="mt-1 text-sm text-slate-600">
                                  {event.note}
                                </p>
                              )}
                              {event.actor?.name && (
                                <p className="mt-1 text-xs text-slate-400">
                                  Recorded by {event.actor.name}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </TruckShell>
  );
}
