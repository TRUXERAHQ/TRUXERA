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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "At Risk": "bg-red-50 text-red-700 border-red-200",
    Available: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "On Route": "bg-blue-50 text-blue-700 border-blue-200",
    Maintenance: "bg-amber-50 text-amber-700 border-amber-200",
    "Out Of Service": "bg-red-50 text-red-700 border-red-200",
    Planned: "bg-slate-50 text-slate-700 border-slate-200",
    Assigned: "bg-blue-50 text-blue-700 border-blue-200",
    "Picked Up": "bg-blue-50 text-blue-700 border-blue-200",
    "In Transit": "bg-blue-50 text-blue-700 border-blue-200",
    Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Failed: "bg-red-50 text-red-700 border-red-200",
    Cancelled: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[status] || "bg-gray-50 text-gray-700 border-gray-200"
      }`}
    >
      {status}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const styles: Record<string, string> = {
    High: "bg-red-50 text-red-700",
    Medium: "bg-amber-50 text-amber-700",
    Low: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[risk] || "bg-gray-50 text-gray-700"
      }`}
    >
      {risk}
    </span>
  );
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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-200 px-6 py-6">
            <div className="text-2xl font-bold tracking-tight text-slate-950">
              TRUXERA
            </div>
            <div className="mt-1 text-xs font-medium text-slate-500">
              Intelligent Fleet Optimization
            </div>
          </div>

          <nav className="flex-1 px-4 py-6">
            <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Operations
            </div>

            <a
              href="#"
              className="mb-1 block rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white"
            >
              Dashboard
            </a>

            <Link
              href={`/dashboard/trucks?organizationId=${encodeURIComponent(data.organization?.id ?? "")}`}
              className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Fleet
            </Link>

            <Link
              href={`/dashboard/drivers?organizationId=${encodeURIComponent(data.organization?.id ?? "")}`}
              className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Drivers
            </Link>

            <Link
              href={`/dashboard/loads?organizationId=${encodeURIComponent(data.organization?.id ?? "")}`}
              className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Loads &amp; deliveries
            </Link>

            <a
              href="#"
              className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Risk Detection
            </a>

            <Link
              href={`/dashboard/dispatch?organizationId=${encodeURIComponent(data.organization?.id ?? "")}`}
              className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Dispatch
            </Link>

            <div className="mb-3 mt-8 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Management
            </div>

            <a
              href="#"
              className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Analytics
            </a>

            <a
              href="#"
              className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Settings
            </a>
          </nav>

          <div className="border-t border-slate-200 p-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">
                Fleet Status
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {data.trucks.length === 0
                  ? "No fleet data"
                  : data.trucks.some(
                        (truck) =>
                          truck.status === "MAINTENANCE" ||
                          truck.status === "OUT_OF_SERVICE",
                      )
                    ? "Needs attention"
                    : "Operational"}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${metrics.fleetAvailability ?? 0}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {metrics.fleetAvailability === null
                  ? "Availability unavailable"
                  : `${metrics.fleetAvailability}% available fleet`}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <section className="flex-1">
          {/* Header */}
          <header className="border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between px-6 py-5 lg:px-8">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  {new Intl.DateTimeFormat("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone,
                  }).format(new Date())}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">
                  Fleet Operations
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {data.organization?.name ?? "No organization selected"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {data.organizations.length > 1 && (
                  <form action="/" method="get" className="flex items-center gap-2">
                    <label className="sr-only" htmlFor="organizationId">
                      Organization
                    </label>
                    <select
                      id="organizationId"
                      name="organizationId"
                      defaultValue={data.organization?.id ?? ""}
                      className="max-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
                    >
                      {data.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      View
                    </button>
                  </form>
                )}
                <form action={signOutUser}>
                  <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>

          <div className="p-6 lg:p-8">
            {!data.organization && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                No organizations are available yet. Add an organization and
                fleet records to populate this dashboard.
              </div>
            )}

            {/* KPI cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
                    className="cursor-not-allowed whitespace-nowrap rounded-lg bg-red-400 px-4 py-2.5 text-sm font-medium text-white"
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
                    href={`/dashboard/trucks?organizationId=${encodeURIComponent(data.organization?.id ?? "")}`}
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
                              <span className="font-semibold">
                                {truck.unitNumber}
                              </span>
                              <StatusBadge status={status} />
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                              {assignedDriver
                                ? `${assignedDriver.name} · ${formatLabel(
                                    assignedDriver.status,
                                  )}`
                                : "No active driver"}
                              {" · "}
                              {truck.currentLocation ?? "Location unavailable"}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {loadReferences.length
                                ? `Current load${loadReferences.length > 1 ? "s" : ""}: ${loadReferences.join(", ")}`
                                : "No active load"}
                            </p>
                          </div>

                          <div className="text-right">
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

                  <button className="text-sm font-medium text-slate-600 hover:text-slate-900">
                    View all
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-slate-500">
                        <th className="px-5 py-3 font-medium">Delivery</th>
                        <th className="px-5 py-3 font-medium">Assignment</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">ETA</th>
                        <th className="px-5 py-3 font-medium">Risk</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {displayedDeliveries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-6 text-sm text-slate-500"
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
                            <tr key={delivery.id}>
                              <td className="px-5 py-4">
                                <div className="font-medium">
                                  {getDeliveryLabel(delivery)}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {delivery.recipientName ??
                                    delivery.load.customerName}
                                </div>
                              </td>

                              <td className="px-5 py-4 text-sm text-slate-600">
                                {assignment ? (
                                  <>
                                    <div>{assignment.truck.unitNumber}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {assignment.driver.name}
                                    </div>
                                  </>
                                ) : (
                                  "Unassigned"
                                )}
                              </td>

                              <td className="px-5 py-4">
                                <StatusBadge
                                  status={formatLabel(delivery.status)}
                                />
                              </td>

                              <td className="px-5 py-4 text-sm text-slate-600">
                                {formatEta(delivery.eta, timeZone)}
                              </td>

                              <td className="px-5 py-4">
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
                      className="cursor-not-allowed rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-400"
                    >
                      Ignore
                    </button>

                    <button
                      disabled
                      title="Dashboard data is currently read-only"
                      className="cursor-not-allowed rounded-lg bg-slate-400 px-4 py-2.5 text-sm font-medium text-white"
                    >
                      Reassign
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}