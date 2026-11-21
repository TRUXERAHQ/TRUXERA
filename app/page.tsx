import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getDashboardData } from "@/src/prisma/dashboard-data";
import { getDispatchBoardForOrganization } from "@/src/prisma/operations-data";
import {
  analyzeDeliveryRisksForOrganization,
  summarizeDeliveryRisks,
  type DeliveryRiskAnalysis,
} from "@/src/fleet/delivery-risk";
import {
  getDashboardMetrics,
  getTruckCapacityUtilizationPercent,
} from "@/src/dashboard/dashboard-metrics";
import { signOutUser } from "./auth-actions";
import TruckShell from "./dashboard/trucks/truck-shell";
import {
  Badge,
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  PageHeader,
  tableCellClass,
  tableClass,
  tableHeadClass,
  tableRowClass,
  type BadgeTone,
} from "./dashboard/ui";

type HomeProps = {
  searchParams: Promise<{ organizationId?: string | string[] }>;
};

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatEta(value: Date | null, timeZone: string) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatCapacity(value: number | string | null) {
  if (value === null) return "Capacity not set";

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number(value))} kg capacity`;
}

function getDeliveryLabel(delivery: {
  reference: string | null;
  load: { reference: string };
  stopNumber: number;
}) {
  return delivery.reference ?? `${delivery.load.reference} · Stop ${delivery.stopNumber}`;
}

const statusTones: Record<string, BadgeTone> = {
  "At Risk": "danger",
  Available: "success",
  "On Route": "info",
  Maintenance: "warning",
  "Out Of Service": "danger",
  Planned: "neutral",
  Assigned: "info",
  "Picked Up": "info",
  "In Transit": "info",
  Delivered: "success",
  Failed: "danger",
  Cancelled: "neutral",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTones[status] ?? "neutral"}>{status}</Badge>;
}

function RiskBadge({ risk }: { risk: string }) {
  const tone: BadgeTone =
    risk === "High"
      ? "danger"
      : risk === "Medium"
        ? "warning"
        : risk === "Low"
          ? "success"
          : "neutral";
  return <Badge tone={tone}>{risk}</Badge>;
}

export default function Home({ searchParams }: HomeProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading fleet dashboard...
        </main>
      }
    >
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: HomeProps) {
  await connection();

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { organizationId } = await searchParams;
  const requestedOrganizationId = Array.isArray(organizationId)
    ? organizationId[0]
    : organizationId;
  const data = await getDashboardData(
    session.user.id,
    requestedOrganizationId,
  );
  if (data.organizations.length === 0) redirect("/onboarding");
  const operationalBoard = data.organization
    ? await getDispatchBoardForOrganization(
        session.user.id,
        data.organization.id,
      )
    : null;

  const timeZone = data.organization?.timezone ?? "UTC";
  const metrics = getDashboardMetrics(data);
  const activeDeliveries = metrics.activeDeliveries;
  const riskAssignments = operationalBoard?.assignments.flatMap((assignment) =>
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
  ) ?? [];
  const riskAnalyses: Map<string, DeliveryRiskAnalysis> =
    operationalBoard && data.organization
    ? new Map<string, DeliveryRiskAnalysis>(
        analyzeDeliveryRisksForOrganization({
          organizationId: data.organization.id,
          analyzedAt: new Date(),
          deliveries: operationalBoard.deliveries.map((delivery) => ({
            ...delivery,
            load: { weightKg: delivery.load.weightKg },
          })),
          trucks: operationalBoard.trucks.map((truck) => ({
            id: truck.id,
            organizationId: truck.organizationId,
            unitNumber: truck.unitNumber,
            status: truck.status,
            deactivatedAt: truck.deactivatedAt,
            capacityKg:
              truck.capacityKg === null ? null : Number(truck.capacityKg),
          })),
          drivers: operationalBoard.drivers.map((driver) => ({
            id: driver.id,
            organizationId: driver.organizationId,
            name: driver.name,
            status: driver.status,
          })),
          assignments: riskAssignments,
          events: operationalBoard.events,
        }).map(({ deliveryId, analysis }) => [deliveryId, analysis] as const),
      )
    : new Map<string, DeliveryRiskAnalysis>();
  const activeRiskSummary = summarizeDeliveryRisks(
    activeDeliveries.flatMap((delivery) => {
      const analysis = riskAnalyses.get(delivery.id);
      return analysis ? [analysis] : [];
    }),
  );
  activeRiskSummary.insufficientData += activeDeliveries.filter(
    (delivery) => !riskAnalyses.has(delivery.id),
  ).length;
  const highRiskDeliveries = activeDeliveries.filter(
    (delivery) => riskAnalyses.get(delivery.id)?.riskLevel === "HIGH",
  );
  const assignmentByDeliveryId = new Map(
    data.assignments.map((assignment) => [assignment.deliveryId, assignment]),
  );
  const activeAssignmentsByTruckId = new Map<
    string,
    typeof metrics.activeAssignments
  >();
  for (const assignment of metrics.activeAssignments) {
    const truckAssignments =
      activeAssignmentsByTruckId.get(assignment.truckId) ?? [];
    truckAssignments.push(assignment);
    activeAssignmentsByTruckId.set(assignment.truckId, truckAssignments);
  }
  const deliveryById = new Map(
    data.deliveries.map((delivery) => [delivery.id, delivery]),
  );
  const displayedDeliveries = [...activeDeliveries]
    .sort((left, right) => {
      const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const leftRisk = riskAnalyses.get(left.id)?.riskLevel;
      const rightRisk = riskAnalyses.get(right.id)?.riskLevel;
      const riskDifference =
        (leftRisk ? riskOrder[leftRisk] : 3) -
        (rightRisk ? riskOrder[rightRisk] : 3);
      if (riskDifference !== 0) return riskDifference;

      return (
        (left.eta?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.eta?.getTime() ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, 8);
  const recoveryDelivery = highRiskDeliveries[0];
  const recoveryAssignment = recoveryDelivery
    ? assignmentByDeliveryId.get(recoveryDelivery.id)
    : undefined;
  const fleetAttention: { label: string; tone: BadgeTone } =
    data.trucks.length === 0
      ? { label: "No fleet data", tone: "neutral" }
      : data.trucks.some(
            (truck) =>
              truck.status === "MAINTENANCE" ||
              truck.status === "OUT_OF_SERVICE",
          )
        ? { label: "Needs attention", tone: "warning" }
        : { label: "Operational", tone: "success" };

  if (!data.organization) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">No organization selected</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            No organizations are available yet. Add an organization and fleet
            records to populate this dashboard.
          </p>
          <form action={signOutUser} className="mt-6">
            <button className={buttonSecondaryClass}>Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <TruckShell
      organizations={data.organizations}
      organization={data.organization}
      activeSection="dashboard"
    >
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone,
        }).format(new Date())}
        title="Fleet Operations"
        description={data.organization.name}
      />

      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Active Trucks
          </p>
          <div className="mt-2 text-3xl font-bold">
            {data.trucks.length}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {metrics.availableTrucks} available · {metrics.onRouteTrucks}{" "}
            on route · {metrics.maintenanceTrucks} maintenance ·{" "}
            {metrics.outOfServiceTrucks} out of service
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Active Drivers
          </p>
          <div className="mt-2 text-3xl font-bold">
            {metrics.activeDrivers}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Available or on duty
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Total Deliveries
          </p>
          <div className="mt-2 text-3xl font-bold">
            {data.deliveries.length}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {activeDeliveries.length} open ·{" "}
            {metrics.deliveryStatusCounts.DELIVERED} delivered
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Active Loads
          </p>
          <div className="mt-2 text-3xl font-bold">
            {metrics.activeLoads}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Loads with at least one open delivery
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            At-Risk Deliveries
          </p>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {highRiskDeliveries.length}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            High {activeRiskSummary.HIGH} · Medium{" "}
            {activeRiskSummary.MEDIUM} · Low {activeRiskSummary.LOW} ·
            Insufficient data {activeRiskSummary.insufficientData}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {activeRiskSummary.requiringIntervention} need review ·{" "}
            {activeRiskSummary.withEligibleReassignment} have an eligible replacement
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Fleet Availability
          </p>
          <div className="mt-2 text-3xl font-bold">
            {metrics.fleetAvailability === null
              ? "—"
              : `${metrics.fleetAvailability}%`}
          </div>
          <p className="mt-2 text-xs text-blue-600">
            {metrics.fleetAvailability === null
              ? "No active trucks to calculate"
              : `${metrics.availableTrucks} of ${data.trucks.length} trucks available`}
          </p>
          <Badge tone={fleetAttention.tone} className="mt-2">
            {fleetAttention.label}
          </Badge>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="text-sm font-semibold">Delivery status</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(metrics.deliveryStatusCounts).map(
            ([status, count]) => (
              <span
                key={status}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
              >
                {formatLabel(status)}: {count}
              </span>
            ),
          )}
        </div>
      </div>

      {/* Risk alert */}
      <div
        className={`mt-6 rounded-xl border p-5 ${
          recoveryDelivery
            ? "border-red-200 bg-red-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  recoveryDelivery ? "bg-red-500" : "bg-emerald-500"
                }`}
              />
              <h2
                className={`font-semibold ${
                  recoveryDelivery ? "text-red-900" : "text-emerald-900"
                }`}
              >
                {recoveryDelivery
                  ? `${getDeliveryLabel(recoveryDelivery)} is at high risk`
                  : "No active high-risk deliveries"}
              </h2>
            </div>

            <p
              className={`mt-2 text-sm ${
                recoveryDelivery ? "text-red-800" : "text-emerald-800"
              }`}
            >
              {recoveryDelivery
                  ? `Status: ${formatLabel(recoveryDelivery.status)}. ${
                      riskAnalyses.get(recoveryDelivery.id)?.reasons[0] ??
                      "Review the available operational evidence."
                    } Current assignment: ${
                      recoveryAssignment?.truck.unitNumber ??
                      "No truck assigned"
                    } · ${
                      recoveryAssignment?.driver.name ?? "No driver assigned"
                    }.`
                : "There are no current high-risk deliveries to review."}
            </p>
            {recoveryDelivery && (
              <p className="mt-2 text-xs text-red-800">
                Deterministic operational analysis, not an AI prediction.
              </p>
            )}
          </div>

          {recoveryDelivery && (
            <button
              disabled
              title="Dashboard data is currently read-only"
              className={`${buttonDangerClass} cursor-not-allowed opacity-60`}
            >
              Review Recovery
            </button>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Fleet */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold">Fleet Overview</h2>
              <p className="mt-1 text-xs text-slate-500">
                Current truck operations
              </p>
            </div>

            <Link
              href={`/dashboard/trucks?organizationId=${encodeURIComponent(data.organization.id)}`}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View all
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {data.trucks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                No trucks are registered for this organization.
              </p>
            ) : (
              data.trucks.map((truck) => {
                const truckAssignments =
                  activeAssignmentsByTruckId.get(truck.id) ?? [];
                const assignedDriver = truckAssignments[0]?.driver;
                const utilization = getTruckCapacityUtilizationPercent(
                  truck,
                  truckAssignments,
                  deliveryById,
                );
                const loadReferences = [
                  ...new Set(
                    truckAssignments
                      .map(
                        (assignment) =>
                          deliveryById.get(assignment.deliveryId)?.load
                            .reference,
                      )
                      .filter((reference): reference is string =>
                        Boolean(reference),
                      ),
                  ),
                ];
                const truckHasHighRiskDelivery = truckAssignments.some(
                  (assignment) =>
                    riskAnalyses.get(assignment.deliveryId)?.riskLevel ===
                      "HIGH",
                );
                const status = truckHasHighRiskDelivery
                  ? "At Risk"
                  : formatLabel(truck.status);

                return (
                  <div
                    key={truck.id}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold break-words">
                          {truck.unitNumber}
                        </span>
                        <StatusBadge status={status} />
                      </div>
                      <p className="mt-1 break-words text-sm text-slate-500">
                        {assignedDriver
                          ? `${assignedDriver.name} · ${formatLabel(
                              assignedDriver.status,
                            )}`
                          : "No active driver"}
                        {" · "}
                        {truck.currentLocation ?? "Location unavailable"}
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {loadReferences.length
                          ? `Current load${loadReferences.length > 1 ? "s" : ""}: ${loadReferences.join(", ")}`
                          : "No active load"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatCapacity(truck.capacityKg)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {truckAssignments.length} active deliveries
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {utilization === null
                          ? "Utilization unavailable"
                          : `Estimated utilization ${utilization}%`}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Deliveries */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold">Delivery Monitor</h2>
              <p className="mt-1 text-xs text-slate-500">
                Status, ETA and current assignments
              </p>
            </div>

            <Link
              href={`/dashboard/loads?organizationId=${encodeURIComponent(data.organization.id)}`}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View all
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={`${tableHeadClass} px-5 py-3`}>Delivery</th>
                  <th className={`${tableHeadClass} px-5 py-3`}>Assignment</th>
                  <th className={`${tableHeadClass} px-5 py-3`}>Status</th>
                  <th className={`${tableHeadClass} px-5 py-3`}>ETA</th>
                  <th className={`${tableHeadClass} px-5 py-3`}>Risk</th>
                </tr>
              </thead>

              <tbody>
                {displayedDeliveries.length === 0 ? (
                  <tr className={tableRowClass}>
                    <td
                      colSpan={5}
                      className={`${tableCellClass} px-5 py-6 text-slate-500`}
                    >
                      No current deliveries for this organization.
                    </td>
                  </tr>
                ) : (
                  displayedDeliveries.map((delivery) => {
                    const assignment = assignmentByDeliveryId.get(
                      delivery.id,
                    );

                    return (
                      <tr key={delivery.id} className={tableRowClass}>
                        <td className={`${tableCellClass} px-5 py-4`}>
                          <div className="font-medium break-words">
                            {getDeliveryLabel(delivery)}
                          </div>
                          <div className="mt-1 break-words text-xs text-slate-500">
                            {delivery.recipientName ??
                              delivery.load.customerName}
                          </div>
                        </td>

                        <td className={`${tableCellClass} px-5 py-4 text-slate-600`}>
                          {assignment ? (
                            <>
                              <div className="break-words">{assignment.truck.unitNumber}</div>
                              <div className="mt-1 break-words text-xs text-slate-500">
                                {assignment.driver.name}
                              </div>
                            </>
                          ) : (
                            "Unassigned"
                          )}
                        </td>

                        <td className={`${tableCellClass} px-5 py-4`}>
                          <StatusBadge
                            status={formatLabel(delivery.status)}
                          />
                        </td>

                        <td className={`${tableCellClass} px-5 py-4 text-slate-600`}>
                          {formatEta(delivery.eta, timeZone)}
                        </td>

                        <td className={`${tableCellClass} px-5 py-4`}>
                          <RiskBadge
                            risk={formatLabel(
                              riskAnalyses.get(delivery.id)?.riskLevel ??
                                "INSUFFICIENT_DATA",
                            )}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recovery review */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Operations Summary
            </p>

            <h2 className="mt-2 text-xl font-bold">
              {recoveryDelivery
                ? "Recovery review"
                : "No recovery action to review"}
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {recoveryDelivery
                ? `${getDeliveryLabel(recoveryDelivery)} is assessed HIGH with status ${formatLabel(
                    recoveryDelivery.status,
                  )}. ${
                    riskAnalyses.get(recoveryDelivery.id)?.reasons[0] ??
                    "Review the available operational evidence."
                  } Current assignment: ${
                    recoveryAssignment?.truck.unitNumber ??
                    "No truck assigned"
                  } · ${
                    recoveryAssignment?.driver.name ?? "No driver assigned"
                  }.`
                : "No active high-risk delivery records are available for recovery review."}
            </p>
          </div>

          {recoveryDelivery && (
            <div className="flex shrink-0 gap-3">
              <button
                disabled
                title="Dashboard data is currently read-only"
                className={`${buttonSecondaryClass} cursor-not-allowed opacity-60`}
              >
                Ignore
              </button>

              <button
                disabled
                title="Dashboard data is currently read-only"
                className={`${buttonPrimaryClass} cursor-not-allowed opacity-60`}
              >
                Reassign
              </button>
            </div>
          )}
        </div>
      </div>
    </TruckShell>
  );
}
