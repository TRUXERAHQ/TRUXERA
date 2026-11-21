import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
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

function KpiIcon({
  name,
}: {
  name: "truck" | "users" | "package" | "layers" | "alert" | "pulse";
}) {
  const paths: Record<string, ReactNode> = {
    truck: (
      <>
        <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="17" cy="19" r="2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.6 3.5 5.5" />
      </>
    ),
    package: (
      <>
        <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
        <path d="M3 8l9 5 9-5M12 13v8" />
      </>
    ),
    layers: (
      <>
        <path d="m12 2 10 5-10 5L2 7l10-5z" />
        <path d="m2 12 10 5 10-5" />
        <path d="m2 17 10 5 10-5" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2 20h20L12 3z" />
        <path d="M12 10v4" />
        <path d="M12 17.5v.5" />
      </>
    ),
    pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function KpiCard({
  icon,
  label,
  iconClass,
  children,
  hint,
  danger = false,
}: {
  icon: Parameters<typeof KpiIcon>[0]["name"];
  label: string;
  iconClass: string;
  children: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        danger ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <KpiIcon name={icon} />
        </span>
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
      <div
        className={`mt-3 text-3xl font-bold tracking-tight ${
          danger ? "text-red-600" : "text-slate-950"
        }`}
      >
        {children}
      </div>
      {hint && <div className="mt-2 text-xs leading-5 text-slate-600">{hint}</div>}
    </div>
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
        <KpiCard
          icon="truck"
          label="Active Trucks"
          iconClass="bg-indigo-50 text-indigo-600"
          hint={`${metrics.availableTrucks} available · ${metrics.onRouteTrucks} on route · ${metrics.maintenanceTrucks} maintenance · ${metrics.outOfServiceTrucks} out of service`}
        >
          {data.trucks.length}
        </KpiCard>

        <KpiCard
          icon="users"
          label="Active Drivers"
          iconClass="bg-violet-50 text-violet-600"
          hint="Available or on duty"
        >
          {metrics.activeDrivers}
        </KpiCard>

        <KpiCard
          icon="package"
          label="Total Deliveries"
          iconClass="bg-cyan-50 text-cyan-600"
          hint={`${activeDeliveries.length} open · ${metrics.deliveryStatusCounts.DELIVERED} delivered`}
        >
          {data.deliveries.length}
        </KpiCard>

        <KpiCard
          icon="layers"
          label="Active Loads"
          iconClass="bg-blue-50 text-blue-600"
          hint="Loads with at least one open delivery"
        >
          {metrics.activeLoads}
        </KpiCard>

        <KpiCard
          icon="alert"
          label="At-Risk Deliveries"
          iconClass="bg-red-50 text-red-600"
          danger
          hint={`High ${activeRiskSummary.HIGH} · Medium ${activeRiskSummary.MEDIUM} · Low ${activeRiskSummary.LOW} · Insufficient data ${activeRiskSummary.insufficientData} · ${activeRiskSummary.requiringIntervention} need review · ${activeRiskSummary.withEligibleReassignment} have an eligible replacement`}
        >
          {highRiskDeliveries.length}
        </KpiCard>

        <KpiCard
          icon="pulse"
          label="Fleet Availability"
          iconClass="bg-emerald-50 text-emerald-600"
          hint={
            <>
              {metrics.fleetAvailability === null
                ? "No active trucks to calculate"
                : `${metrics.availableTrucks} of ${data.trucks.length} trucks available`}
              <Badge tone={fleetAttention.tone} className="ml-2">
                {fleetAttention.label}
              </Badge>
            </>
          }
        >
          {metrics.fleetAvailability === null
            ? "—"
            : `${metrics.fleetAvailability}%`}
        </KpiCard>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-800">Delivery status</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(metrics.deliveryStatusCounts).map(
            ([status, count]) => (
              <Badge
                key={status}
                tone={statusTones[formatLabel(status)] ?? "neutral"}
              >
                {formatLabel(status)}: {count}
              </Badge>
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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-800">Fleet Overview</h2>
              <p className="mt-1 text-xs text-slate-600">
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
              <p className="px-5 py-6 text-sm text-slate-600">
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
                      <p className="mt-1 break-words text-sm text-slate-600">
                        {assignedDriver
                          ? `${assignedDriver.name} · ${formatLabel(
                              assignedDriver.status,
                            )}`
                          : "No active driver"}
                        {" · "}
                        {truck.currentLocation ?? "Location unavailable"}
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-600">
                        {loadReferences.length
                          ? `Current load${loadReferences.length > 1 ? "s" : ""}: ${loadReferences.join(", ")}`
                          : "No active load"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatCapacity(truck.capacityKg)}
                      </p>
                      <p className="text-xs text-slate-600">
                        {truckAssignments.length} active deliveries
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {utilization === null
                          ? "Utilization unavailable"
                          : `Estimated utilization ${utilization}%`}
                      </p>
                      {utilization !== null && (
                        <div
                          className="ml-auto mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-slate-100"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{
                              width: `${Math.min(100, Math.max(0, utilization))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Deliveries */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-800">Delivery Monitor</h2>
              <p className="mt-1 text-xs text-slate-600">
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
                      className={`${tableCellClass} px-5 py-6`}
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
                          <div className="mt-1 break-words text-xs text-slate-600">
                            {delivery.recipientName ??
                              delivery.load.customerName}
                          </div>
                        </td>

                        <td className={`${tableCellClass} px-5 py-4 text-slate-600`}>
                          {assignment ? (
                            <>
                              <div className="break-words">{assignment.truck.unitNumber}</div>
                              <div className="mt-1 break-words text-xs text-slate-600">
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
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
