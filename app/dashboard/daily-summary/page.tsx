import { Suspense } from "react";
import { notFound } from "next/navigation";
import TruckShell from "../trucks/truck-shell";
import {
  getOperationsPageContext,
  type OperationsSearchParams,
} from "../operations-page-data";
import { getDispatchBoardForOrganization } from "@/src/prisma/operations-data";
import { analyzeDeliveryRisksForOrganization } from "@/src/fleet/delivery-risk";
import { buildDownstreamImpact } from "@/src/dashboard/load-impact";
import {
  buildDailyOperationsSummary,
  type DailyDeliveryInput,
} from "@/src/dashboard/daily-summary";
import DailySummaryView from "./daily-summary-view";

type SearchParams = OperationsSearchParams & { date?: string | string[] };

type Props = { searchParams: Promise<SearchParams> };

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function todayInTimezone(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function DailySummaryPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading daily operations summary...
        </main>
      }
    >
      <DailySummaryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DailySummaryContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  const board = await getDispatchBoardForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!board) notFound();

  const timezone = context.organization.timezone;
  const requestedDate = firstValue(params.date);
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : todayInTimezone(timezone);

  const organizationId = context.organization.id;
  const riskAnalyses = new Map(
    analyzeDeliveryRisksForOrganization({
      organizationId,
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
      assignments: board.assignments.flatMap((assignment) =>
        assignment.delivery
          ? [
              {
                id: assignment.id,
                organizationId: assignment.organizationId,
                deliveryId: assignment.deliveryId,
                truckId: assignment.truckId,
                driverId: assignment.driverId,
                assignedAt: assignment.assignedAt,
                endedAt: assignment.endedAt,
                endReason: assignment.endReason,
                truck: assignment.truck,
                driver: assignment.driver,
                delivery: {
                  organizationId: assignment.delivery.organizationId,
                  loadId: assignment.delivery.loadId,
                },
              },
            ]
          : [],
      ),
      events: board.events,
    }).map(({ deliveryId, analysis }) => [
      deliveryId,
      { riskLevel: analysis.riskLevel },
    ]),
  );

  const assignmentsByDeliveryId = new Map<string, typeof board.assignments>();
  for (const assignment of board.assignments) {
    const list = assignmentsByDeliveryId.get(assignment.deliveryId) ?? [];
    list.push(assignment);
    assignmentsByDeliveryId.set(assignment.deliveryId, list);
  }
  const eventsByDeliveryId = new Map<
    string,
    typeof board.events
  >();
  for (const event of board.events) {
    const list = eventsByDeliveryId.get(event.deliveryId) ?? [];
    list.push(event);
    eventsByDeliveryId.set(event.deliveryId, list);
  }

  const deliveriesByLoadId = new Map<string, typeof board.deliveries>();
  for (const delivery of board.deliveries) {
    const list = deliveriesByLoadId.get(delivery.loadId) ?? [];
    list.push(delivery);
    deliveriesByLoadId.set(delivery.loadId, list);
  }

  const impactAssignments = new Map(
    [...assignmentsByDeliveryId.entries()].map(([deliveryId, list]) => [
      deliveryId,
      list.map((assignment) => ({
        id: assignment.id,
        truckId: assignment.truckId,
        driverId: assignment.driverId,
        truck: { unitNumber: assignment.truck.unitNumber },
        driver: { name: assignment.driver.name },
        assignedAt: assignment.assignedAt,
        endedAt: assignment.endedAt,
        endReason: assignment.endReason,
      })),
    ]),
  );
  const impactEvents = new Map(
    [...eventsByDeliveryId.entries()].map(([deliveryId, list]) => [
      deliveryId,
      list.map((event) => ({
        type: event.type,
        toStatus: event.toStatus,
        note: event.note,
        occurredAt: event.occurredAt,
      })),
    ]),
  );

  const downstreamEntriesByLoadId = new Map<
    string,
    ReturnType<typeof buildDownstreamImpact>["entries"]
  >();
  for (const [loadId, loadDeliveries] of deliveriesByLoadId) {
    const load = loadDeliveries[0].load;
    const impactRisk = new Map(
      loadDeliveries.map((delivery) => [
        delivery.id,
        riskAnalyses.get(delivery.id) ?? { riskLevel: null },
      ]),
    );
    downstreamEntriesByLoadId.set(
      loadId,
      buildDownstreamImpact({
        deliveries: loadDeliveries,
        loadCustomerName: load.customerName,
        riskByDeliveryId: impactRisk,
        assignmentsByDeliveryId: impactAssignments,
        eventsByDeliveryId: impactEvents,
        timezone,
      }).entries,
    );
  }

  const dailyInputs: DailyDeliveryInput[] = board.deliveries.map(
    (delivery) => ({
      delivery: {
        id: delivery.id,
        loadId: delivery.loadId,
        loadReference: delivery.load.reference,
        customerName: delivery.load.customerName,
        reference: delivery.reference,
        stopNumber: delivery.stopNumber,
        recipientName: delivery.recipientName,
        status: delivery.status,
        eta: delivery.eta,
        deliveredAt: delivery.deliveredAt,
        createdAt: delivery.createdAt,
        deliveryWindowStart: delivery.deliveryWindowStart,
        deliveryWindowEnd: delivery.deliveryWindowEnd,
      },
      assignments: (assignmentsByDeliveryId.get(delivery.id) ?? []).map(
        (assignment) => ({
          id: assignment.id,
          truckId: assignment.truckId,
          driverId: assignment.driverId,
          assignedAt: assignment.assignedAt,
          endedAt: assignment.endedAt,
          endReason: assignment.endReason,
          truck: assignment.truck,
          driver: assignment.driver,
        }),
      ),
      events: (eventsByDeliveryId.get(delivery.id) ?? []).map((event) => ({
        type: event.type,
        toStatus: event.toStatus,
        note: event.note,
        occurredAt: event.occurredAt,
      })),
      riskLevel: riskAnalyses.get(delivery.id)?.riskLevel ?? null,
      projectedDelay:
        delivery.eta !== null &&
        delivery.deliveryWindowEnd !== null &&
        delivery.eta.getTime() > delivery.deliveryWindowEnd.getTime(),
      downstreamEntries:
        downstreamEntriesByLoadId.get(delivery.loadId) ?? [],
    }),
  );

  const summary = buildDailyOperationsSummary({
    date,
    timezone,
    deliveries: dailyInputs,
  });

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="daily-summary"
    >
      <DailySummaryView
        summary={summary}
        organizationId={context.organization.id}
        selectedDate={date}
      />
    </TruckShell>
  );
}
