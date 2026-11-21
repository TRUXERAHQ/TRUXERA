import { Suspense } from "react";
import { notFound } from "next/navigation";
import TruckShell from "../trucks/truck-shell";
import {
  getOperationsPageContext,
  type OperationsSearchParams,
} from "../operations-page-data";
import { getDispatchBoardForOrganization } from "@/src/prisma/operations-data";
import { buildDailyDeliveryInputs } from "../report-data";
import {
  buildOperationalHistory,
  type OperationalHistoryEventType,
  type OperationalHistoryFilters,
} from "@/src/dashboard/operational-history";
import type { RecoveryOutcome } from "@/src/dashboard/recovery-result";
import OperationalHistoryView from "./operational-history-view";

type SearchParams = OperationsSearchParams & {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
  loadId?: string | string[];
  deliveryId?: string | string[];
  truckId?: string | string[];
  driverId?: string | string[];
  type?: string | string[];
  outcome?: string | string[];
  order?: string | string[];
};

type Props = { searchParams: Promise<SearchParams> };

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const historyTypes = new Set<OperationalHistoryEventType>([
  "LOAD_CREATED",
  "DELIVERY_CREATED",
  "DELIVERY_DELIVERED",
  "DELIVERY_EVENT",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_ENDED",
  "RECOVERY_ACTION",
  "IMPACT_MEASURED",
]);

const historyOutcomes = new Set<RecoveryOutcome>([
  "successful",
  "monitoring",
  "unresolved",
  "insufficientData",
]);

export default function OperationalHistoryPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading operational history...
        </main>
      }
    >
      <OperationalHistoryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OperationalHistoryContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  const board = await getDispatchBoardForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!board) notFound();

  const timezone = context.organization.timezone;
  const dailyInputs = buildDailyDeliveryInputs(
    board,
    context.organization.id,
    timezone,
  );

  const loadsById = new Map<
    string,
    { id: string; reference: string; createdAt: Date | null }
  >();
  for (const delivery of board.deliveries) {
    if (!loadsById.has(delivery.loadId)) {
      loadsById.set(delivery.loadId, {
        id: delivery.loadId,
        reference: delivery.load.reference,
        createdAt: delivery.load.createdAt,
      });
    }
  }

  const requestedType = firstValue(params.type);
  const requestedOutcome = firstValue(params.outcome);
  const filters: OperationalHistoryFilters = {
    q: firstValue(params.q) ?? null,
    from: firstValue(params.from) ?? null,
    to: firstValue(params.to) ?? null,
    loadId: firstValue(params.loadId) ?? null,
    deliveryId: firstValue(params.deliveryId) ?? null,
    truckId: firstValue(params.truckId) ?? null,
    driverId: firstValue(params.driverId) ?? null,
    type:
      requestedType && historyTypes.has(requestedType as OperationalHistoryEventType)
        ? requestedType
        : null,
    outcome:
      requestedOutcome &&
      historyOutcomes.has(requestedOutcome as RecoveryOutcome)
        ? requestedOutcome
        : null,
    order: firstValue(params.order) === "asc" ? "asc" : "desc",
  };

  const history = buildOperationalHistory({
    deliveries: dailyInputs,
    loads: [...loadsById.values()],
    timezone,
    filters,
  });

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="operational-history"
    >
      <OperationalHistoryView
        history={history}
        organizationId={context.organization.id}
        filters={filters}
      />
    </TruckShell>
  );
}
