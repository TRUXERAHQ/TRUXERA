import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDispatchBoardForOrganization } from "@/src/prisma/operations-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../operations-page-data";
import {
  AssignDeliveryForm,
  EndAssignmentForm,
  ReassignDeliveryForm,
} from "./assignment-forms";
import { analyzeDeliveryRisksForOrganization } from "@/src/fleet/delivery-risk";
import TruckShell from "../trucks/truck-shell";
import {
  Badge,
  buttonPrimaryClass,
  EmptyState,
  Notice,
  PageHeader,
  riskTone,
  statusTone,
} from "../ui";

type Props = { searchParams: Promise<OperationsSearchParams> };

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export default function DispatchPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading dispatch board...</main>}>
      <DispatchContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DispatchContent({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams);
  const board = await getDispatchBoardForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!board) notFound();

  const availableTrucks = board.trucks.filter(
    (truck) => truck.status === "AVAILABLE" && truck.deactivatedAt === null,
  );
  const availableDrivers = board.drivers.filter(
    (driver) =>
      driver.status === "AVAILABLE" || driver.status === "ON_DUTY",
  );
  const activeAssignments = board.assignments.filter(
    (assignment) => assignment.endedAt === null,
  );
  const assignmentByDeliveryId = new Map(
    activeAssignments.map((assignment) => [assignment.deliveryId, assignment]),
  );
  const deliveryById = new Map(
    board.deliveries.map((delivery) => [delivery.id, delivery]),
  );
  const assignmentHistory = board.assignments
    .filter((assignment) => assignment.endedAt !== null)
    .slice(0, 10);
  const activeResourceAssignments = activeAssignments.flatMap((assignment) => {
    const delivery = deliveryById.get(assignment.deliveryId);
    return delivery
      ? [{
          id: assignment.id,
          deliveryId: assignment.deliveryId,
          loadId: delivery.loadId,
          truckId: assignment.truckId,
          driverId: assignment.driverId,
          endedAt: assignment.endedAt,
        }]
      : [];
  });
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
  const riskAnalyses = new Map(
    analyzeDeliveryRisksForOrganization({
      organizationId: context.organization.id,
      analyzedAt: new Date(),
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
        capacityKg:
          truck.capacityKg === null ? null : Number(truck.capacityKg),
      })),
      drivers: board.drivers.map((driver) => ({
        id: driver.id,
        organizationId: driver.organizationId,
        name: driver.name,
        status: driver.status,
      })),
      assignments: riskAssignments,
      events: board.events,
    }).map(({ deliveryId, analysis }) => [deliveryId, analysis] as const),
  );

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="dispatch">
      <PageHeader
        eyebrow="Fleet operations"
        title="Dispatch"
        description="Assign planned deliveries and review deterministic, dispatcher-approved alternatives for active assignments. Changes are retained in history."
      />

      {(context.assigned || context.ended || context.reassigned) && (
        <div className="mt-5">
          <Notice tone="success">
            {context.reassigned
              ? "Delivery reassigned. The previous assignment remains in history."
              : context.assigned
                ? "Delivery assigned."
                : "Assignment ended and retained in history."}
          </Notice>
        </div>
      )}
      {context.hasError && (
        <div className="mt-5">
          <Notice tone="danger">
            The dispatch operation could not be completed.
          </Notice>
        </div>
      )}

      {board.deliveries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No deliveries to dispatch"
            description="Create a load with one or more delivery stops first."
            action={
              context.canManage ? (
                <Link
                  href={`/dashboard/loads/new?${organizationQuery(context.organization.id)}`}
                  className={buttonPrimaryClass}
                >
                  Create a load
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <section aria-label="Deliveries for dispatch" className="mt-8 space-y-4">
          {board.deliveries.map((delivery) => {
            const assignment = assignmentByDeliveryId.get(delivery.id);
            const risk = riskAnalyses.get(delivery.id);
            const recommendation = risk?.intervention.recommendation;
            const unavailableTruckIds = new Set(
              activeResourceAssignments
                .filter(
                  (active) =>
                    active.loadId !== delivery.loadId &&
                    active.truckId !== assignment?.truckId,
                )
                .map((active) => active.truckId),
            );
            const unavailableDriverIds = new Set(
              activeResourceAssignments
                .filter(
                  (active) =>
                    active.loadId !== delivery.loadId &&
                    active.driverId !== assignment?.driverId,
                )
                .map((active) => active.driverId),
            );
            const trucksForDelivery = availableTrucks.filter(
              (truck) => !unavailableTruckIds.has(truck.id),
            );
            const driversForDelivery = availableDrivers.filter(
              (driver) => !unavailableDriverIds.has(driver.id),
            );
            const canAssign =
              (delivery.status === "PLANNED" || delivery.status === "ASSIGNED") &&
              !assignment;

            return (
              <article id={`delivery-${delivery.id}`} key={delivery.id} className="grid scroll-mt-24 gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-lg font-semibold">{delivery.reference ?? `${delivery.load.reference} · Stop ${delivery.stopNumber}`}</h2>
                    <Badge tone={statusTone(delivery.status)}>{formatLabel(delivery.status)}</Badge>
                    <Badge tone={riskTone(risk?.riskLevel ?? null)}>
                      {risk?.riskLevel
                        ? `analyzed ${formatLabel(risk.riskLevel)} risk`
                        : "analyzed risk: insufficient data"}
                    </Badge>
                  </div>
                  <p className="mt-1 break-words text-sm text-slate-500">{delivery.load.customerName} · {delivery.destinationAddress}</p>
                  <p className="mt-2 text-xs text-slate-500">Stored risk {formatLabel(delivery.riskLevel)} · ETA {delivery.eta ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: context.organization.timezone }).format(delivery.eta) : "not set"} · Load weight {delivery.load.weightKg === null ? "not recorded" : `${Number(delivery.load.weightKg).toLocaleString()} kg`}</p>
                  {risk && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700">
                        Deterministic operational analysis, not an AI prediction
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                        {risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                      {risk.limitations.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-800">
                          {risk.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                        </ul>
                      )}
                      {risk.intervention.action && (
                        <p className="mt-2 text-xs font-medium text-amber-800">
                          Recommended action: {risk.intervention.action}
                        </p>
                      )}
                    </div>
                  )}
                  {assignment ? (
                    <div className="mt-4 rounded-lg bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current assignment</p>
                      <p className="mt-1 break-words text-sm font-semibold">{assignment.truck.unitNumber} · {assignment.driver.name}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone="neutral">Truck {formatLabel(assignment.truck.status)}</Badge>
                        <Badge tone="neutral">Driver {formatLabel(assignment.driver.status)}</Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">Assigned {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(assignment.assignedAt)}</p>
                      {context.canManage && <EndAssignmentForm organizationId={context.organization.id} assignmentId={assignment.id} />}
                      {risk &&
                        ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(
                          delivery.status,
                        ) && (
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          {risk.riskLevel === "LOW" ? (
                            <div>
                              <p className="text-sm font-semibold text-emerald-800">
                                <Badge tone="success" className="mr-1">Low risk</Badge>
                                No recovery action required.
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Delivery is operating normally. No unresolved
                                operational issue requires dispatcher
                                intervention.
                              </p>
                            </div>
                          ) : risk.riskLevel === "MEDIUM" ||
                            risk.riskLevel === "HIGH" ? (
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                <Badge tone={riskTone(risk.riskLevel)} className="mr-1">
                                  {formatLabel(risk.riskLevel)} risk
                                </Badge>
                                {risk.riskLevel === "HIGH"
                                  ? "Recovery action recommended."
                                  : "Recovery action may be required."}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {risk.intervention
                                  .eligibleReassignmentCount}{" "}
                                eligible replacement combination
                                {risk.intervention
                                  .eligibleReassignmentCount === 1
                                  ? ""
                                  : "s"}
                                .
                              </p>
                              {recommendation ? (
                                context.canManage ? (
                                  <ReassignDeliveryForm
                                    key={assignment.id}
                                    organizationId={context.organization.id}
                                    deliveryId={delivery.id}
                                    currentAssignmentId={assignment.id}
                                    choices={risk.reassignmentCandidates}
                                    initiallyOpen={
                                      context.reassignedDeliveryId !==
                                      delivery.id
                                    }
                                    recommended={recommendation}
                                  />
                                ) : (
                                  <p className="mt-3 text-xs text-slate-500">
                                    Your role allows dispatch viewing only.
                                  </p>
                                )
                              ) : risk.intervention
                                  .insufficientReassignmentDataCount > 0 ? (
                                <p className="mt-2 text-xs text-amber-800">
                                  Insufficient data to verify capacity for an
                                  alternative; no reassignment is offered.
                                </p>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">
                                  No eligible alternative truck and driver are
                                  currently available.
                                </p>
                              )}
                              {risk.intervention
                                .insufficientReassignmentDataCount > 0 && (
                                <p className="mt-2 text-xs text-amber-800">
                                  Capacity fit could not be verified for{" "}
                                  {risk.intervention
                                    .insufficientReassignmentDataCount}{" "}
                                  other combination
                                  {risk.intervention
                                    .insufficientReassignmentDataCount === 1
                                    ? ""
                                    : "s"}
                                  .
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p className="text-xs font-medium text-slate-600">
                                Recovery review is unavailable because risk data
                                is insufficient.
                              </p>
                              {risk.intervention
                                .insufficientReassignmentDataCount > 0 && (
                                <p className="mt-2 text-xs text-amber-800">
                                  Capacity fit could not be verified for{" "}
                                  {risk.intervention
                                    .insufficientReassignmentDataCount}{" "}
                                  other combination
                                  {risk.intervention
                                    .insufficientReassignmentDataCount === 1
                                    ? ""
                                    : "s"}
                                  .
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">No current assignment.</p>
                  )}
                  {delivery.status !== "PLANNED" && delivery.status !== "ASSIGNED" && (
                    <p className="mt-3 text-xs text-slate-500">This delivery status is not eligible for a new assignment.</p>
                  )}
                </div>

                <div className="self-start rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {context.canManage && canAssign ? (
                    <AssignDeliveryForm
                      organizationId={context.organization.id}
                      deliveryId={delivery.id}
                      trucks={trucksForDelivery}
                      drivers={driversForDelivery}
                    />
                  ) : assignment ? (
                    !context.canManage && <p className="text-sm text-slate-500">Your role allows dispatch viewing only.</p>
                  ) : (
                    <p className="text-sm text-slate-500">{context.canManage ? "No assignment can be made for this delivery status." : "Your role allows dispatch viewing only."}</p>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Recent assignment history</h2>
          <p className="mt-1 text-sm text-slate-500">Ended assignments remain as records and are never overwritten when a delivery is assigned again.</p>
        </div>
        {assignmentHistory.length === 0 ? (
          <p className="px-5 py-7 text-sm text-slate-600">No ended assignments recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assignmentHistory.map((assignment) => {
              const delivery = deliveryById.get(assignment.deliveryId);
              return (
                <li key={assignment.id} className="grid gap-2 px-5 py-4 sm:grid-cols-4">
                  <p className="break-words text-sm font-medium">{delivery ? `${delivery.load.reference} · Stop ${delivery.stopNumber}` : "Delivery record"}</p>
                  <p className="break-words text-sm text-slate-600">{assignment.truck.unitNumber} · {assignment.driver.name}</p>
                  <p className="break-words text-sm text-slate-600">{assignment.endReason ?? "Assignment ended"}</p>
                  <p className="text-xs text-slate-500">{assignment.endedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(assignment.endedAt) : ""}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!context.canManage && <p className="mt-6 text-xs text-slate-500">Your organization role allows dispatch viewing but not assignment changes.</p>}
    </TruckShell>
  );
}
