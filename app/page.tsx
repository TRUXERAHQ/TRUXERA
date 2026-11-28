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
import { TruckLineArt } from "./truck-line-art";
import {
  Badge,
  buttonPrimaryClass,
  buttonSecondaryClass,
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

const intelligenceStages = [
  "Detect",
  "Predict",
  "Recommend",
  "Recover",
  "Measure Impact",
  "Generate Summary",
] as const;

const intelligenceStageStyles: Record<
  (typeof intelligenceStages)[number],
  { chip: string; index: string }
> = {
  Detect: {
    chip: "border-blue-200 bg-blue-50/60 text-blue-800",
    index: "text-blue-600",
  },
  Predict: {
    chip: "border-amber-200 bg-amber-50/60 text-amber-800",
    index: "text-amber-600",
  },
  Recommend: {
    chip: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
    index: "text-indigo-600",
  },
  Recover: {
    chip: "border-violet-200 bg-violet-50 text-violet-800",
    index: "text-violet-600",
  },
  "Measure Impact": {
    chip: "border-cyan-200 bg-cyan-50 text-cyan-800",
    index: "text-cyan-600",
  },
  "Generate Summary": {
    chip: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    index: "text-emerald-600",
  },
};

const deliveryStatusChips: Record<string, string> = {
  Planned: "border-slate-200 bg-slate-50 text-slate-600",
  Assigned: "border-blue-200 bg-blue-50 text-blue-700",
  "Picked Up": "border-cyan-200 bg-cyan-50 text-cyan-700",
  "In Transit": "border-sky-200 bg-sky-50 text-sky-700",
  Delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Failed: "border-red-200 bg-red-50 text-red-700",
  Cancelled: "border-slate-200 bg-slate-100 text-slate-500",
  Neutral: "border-slate-200 bg-slate-50 text-slate-600",
};

const fleetStatusDot: Record<string, string> = {
  "At Risk": "bg-red-500",
  Available: "bg-emerald-500",
  "On Route": "bg-blue-500",
  Maintenance: "bg-amber-500",
  "Out Of Service": "bg-red-500",
};

const deliveryStatusBar: Record<string, string> = {
  Planned: "bg-slate-300",
  Assigned: "bg-blue-400",
  "Picked Up": "bg-cyan-400",
  "In Transit": "bg-sky-400",
  Delivered: "bg-emerald-500",
  Failed: "bg-red-500",
  Cancelled: "bg-slate-300",
  Neutral: "bg-slate-300",
};

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
  accentClass,
  surfaceClass = "bg-white",
  valueClass = "text-slate-950",
  children,
  hint,
  danger = false,
  meter,
}: {
  icon: Parameters<typeof KpiIcon>[0]["name"];
  label: string;
  iconClass: string;
  accentClass: string;
  surfaceClass?: string;
  valueClass?: string;
  children: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
  meter?: { value: number; className: string };
}) {
  return (
    <div
      className={`flex h-full flex-col rounded-xl border border-slate-200 border-t-2 p-5 shadow-md ${surfaceClass} ${accentClass}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-black/10 ${iconClass}`}
        >
          <KpiIcon name={icon} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
      </div>
      <div
        className={`mt-3 text-4xl font-bold tracking-tight tabular-nums ${
          danger ? "text-red-600" : valueClass
        }`}
      >
        {children}
      </div>
      {meter && (
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="presentation"
        >
          <div
            className={`h-full rounded-full ${meter.className}`}
            style={{
              width: `${Math.min(100, Math.max(0, meter.value))}%`,
            }}
          />
        </div>
      )}
      {hint && (
        <div className="mt-auto line-clamp-2 pt-2 text-xs leading-5 text-slate-600">
          {hint}
        </div>
      )}
    </div>
  );
}

export default function Home({ searchParams }: HomeProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
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
  const attentionDeliveries = activeDeliveries
    .flatMap((delivery) => {
      const analysis = riskAnalyses.get(delivery.id);
      return analysis?.riskLevel === "HIGH" || analysis?.riskLevel === "MEDIUM"
        ? [{ delivery, analysis }]
        : [];
    })
    .sort(
      (left, right) =>
        (left.analysis.riskLevel === "HIGH" ? 0 : 1) -
        (right.analysis.riskLevel === "HIGH" ? 0 : 1),
    );
  const highRiskCount = attentionDeliveries.filter(
    ({ analysis }) => analysis.riskLevel === "HIGH",
  ).length;
  const mediumRiskCount = attentionDeliveries.length - highRiskCount;
  const visibleAttention = attentionDeliveries.slice(0, 4);
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
  const deliveryStatusEntries = Object.entries(metrics.deliveryStatusCounts);
  const deliveryStatusTotal = deliveryStatusEntries.reduce(
    (sum, [, count]) => sum + count,
    0,
  );

  if (!data.organization) {
    return (
      <main className="min-h-screen bg-background p-8 text-slate-900">
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
      hero={
        <div className="hidden overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-cyan-50/50 px-4 py-3 shadow-sm sm:px-6 xl:block">
          <div className="flex justify-center">
            <TruckLineArt className="h-auto w-full max-w-[1180px]" />
          </div>
        </div>
      }
    >
      {/* KPI cards */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon="truck"
          label="Active Trucks"
          iconClass="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-indigo-500/30"
          accentClass="border-t-indigo-500"
          surfaceClass="bg-gradient-to-br from-indigo-50/80 via-white to-white"
          valueClass="text-indigo-700"
          hint={`${metrics.availableTrucks} available · ${metrics.onRouteTrucks} on route · ${metrics.maintenanceTrucks} maintenance · ${metrics.outOfServiceTrucks} out of service`}
        >
          {data.trucks.length}
        </KpiCard>

        <KpiCard
          icon="users"
          label="Active Drivers"
          iconClass="bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-violet-500/30"
          accentClass="border-t-violet-500"
          surfaceClass="bg-gradient-to-br from-violet-50/80 via-white to-white"
          valueClass="text-violet-700"
          hint="Available or on duty"
        >
          {metrics.activeDrivers}
        </KpiCard>

        <KpiCard
          icon="package"
          label="Total Deliveries"
          iconClass="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-cyan-500/30"
          accentClass="border-t-cyan-500"
          surfaceClass="bg-gradient-to-br from-cyan-50/80 via-white to-white"
          valueClass="text-cyan-700"
          hint={`${activeDeliveries.length} open · ${metrics.deliveryStatusCounts.DELIVERED} delivered`}
        >
          {data.deliveries.length}
        </KpiCard>

        <KpiCard
          icon="layers"
          label="Active Loads"
          iconClass="bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/30"
          accentClass="border-t-blue-500"
          surfaceClass="bg-gradient-to-br from-blue-50/80 via-white to-white"
          valueClass="text-blue-700"
          hint="Loads with at least one open delivery"
        >
          {metrics.activeLoads}
        </KpiCard>

        <KpiCard
          icon="alert"
          label="At-Risk Deliveries"
          iconClass="bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-500/30"
          accentClass="border-t-red-500"
          surfaceClass="bg-gradient-to-br from-red-50/80 via-white to-white"
          danger
          hint={`High ${activeRiskSummary.HIGH} · Medium ${activeRiskSummary.MEDIUM} · Low ${activeRiskSummary.LOW} · Insufficient data ${activeRiskSummary.insufficientData} · ${activeRiskSummary.requiringIntervention} need review · ${activeRiskSummary.withEligibleReassignment} have an eligible replacement`}
        >
          {highRiskDeliveries.length}
        </KpiCard>

        <KpiCard
          icon="pulse"
          label="Fleet Availability"
          iconClass="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/30"
          accentClass="border-t-emerald-500"
          surfaceClass="bg-gradient-to-br from-emerald-50/80 via-white to-white"
          valueClass="text-emerald-700"
          meter={
            metrics.fleetAvailability === null
              ? undefined
              : {
                  value: metrics.fleetAvailability,
                  className:
                    "bg-gradient-to-r from-emerald-500 to-teal-500",
                }
          }
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

      {/* Operational status rail */}
      <div className="mt-4 rounded-xl border border-indigo-100 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500"
            />
            Deliveries
          </span>
          {deliveryStatusEntries.map(([status, count]) => {
            const label = formatLabel(status);
            const chip = deliveryStatusChips[label] ?? deliveryStatusChips.Neutral;
            return (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${chip}`}
              >
                {label}
                <span className="font-bold tabular-nums">{count}</span>
              </span>
            );
          })}
          <span className="ml-auto text-xs font-medium text-slate-500">
            {deliveryStatusTotal} total
          </span>
        </div>
        {deliveryStatusTotal > 0 && (
          <div
            className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label="Delivery status distribution"
          >
            {deliveryStatusEntries.map(([status, count]) => {
              const label = formatLabel(status);
              return (
                <span
                  key={status}
                  className={deliveryStatusBar[label] ?? "bg-slate-300"}
                  style={{ width: `${(count / deliveryStatusTotal) * 100}%` }}
                  title={`${label}: ${count}`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Main operations workspace: fleet rail | attention + delivery monitor | recovery intelligence */}
      <div className="mt-4 grid gap-5 xl:grid-cols-12">
        {/* Fleet */}
        <div className="order-2 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md xl:order-1 xl:col-span-3">
          <div className="flex items-center justify-between border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-white px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-800">
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block h-2 w-2 rounded-[3px] bg-indigo-500 align-middle"
                />
                Fleet Overview
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {data.trucks.length} registered · current operations
              </p>
            </div>

            <Link
              href={`/dashboard/trucks?organizationId=${encodeURIComponent(data.organization.id)}`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
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
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-indigo-50/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            fleetStatusDot[status] ?? "bg-slate-300"
                          }`}
                          aria-hidden="true"
                        />
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
                          className="ml-auto mt-1.5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
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

        {/* Center column: attention + delivery monitor */}
        <div className="order-1 flex min-w-0 flex-col gap-5 xl:order-2 xl:col-span-6">
          {/* Attention required */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-red-50/60 via-white to-amber-50/40 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M12 3 2 20h20L12 3z" />
                    <path d="M12 10v4" />
                    <path d="M12 17.5v.5" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Attention required
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    MEDIUM or HIGH risk deliveries needing review
                  </p>
                </div>
              </div>
              {attentionDeliveries.length > 0 && (
                <div className="flex gap-1.5">
                  {highRiskCount > 0 && (
                    <Badge tone="danger">{highRiskCount} high</Badge>
                  )}
                  {mediumRiskCount > 0 && (
                    <Badge tone="warning">{mediumRiskCount} medium</Badge>
                  )}
                </div>
              )}
            </div>

            {attentionDeliveries.length === 0 ? (
              <div className="flex items-center gap-2.5 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path d="m4.5 12.5 5 5 10-11" />
                  </svg>
                </span>
                <p className="text-sm font-medium text-emerald-800">
                  No immediate recovery attention required — no active
                  deliveries are flagged MEDIUM or HIGH risk.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleAttention.map(({ delivery, analysis }) => {
                  const assignment = assignmentByDeliveryId.get(delivery.id);
                  const isHigh = analysis.riskLevel === "HIGH";
                  const reviewHref = `/dashboard/loads/${encodeURIComponent(
                    delivery.loadId,
                  )}?organizationId=${encodeURIComponent(data.organization.id)}`;

                  return (
                    <li
                      key={delivery.id}
                      className={`flex flex-col gap-2.5 border-l-4 px-4 py-3 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between ${
                        isHigh
                          ? "border-l-red-400 bg-red-50/40"
                          : "border-l-amber-400 bg-amber-50/30"
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                            isHigh ? "bg-red-500" : "bg-amber-500"
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={reviewHref}
                              className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                            >
                              {getDeliveryLabel(delivery)}
                            </Link>
                            <Badge tone={isHigh ? "danger" : "warning"}>
                              {isHigh ? "High risk" : "Medium risk"}
                            </Badge>
                            <Badge
                              tone={
                                statusTones[formatLabel(delivery.status)] ??
                                "neutral"
                              }
                            >
                              {formatLabel(delivery.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 break-words text-sm text-slate-600">
                            {delivery.recipientName ??
                              delivery.load.customerName}
                            {" · "}
                            {assignment
                              ? `${assignment.truck.unitNumber} · ${assignment.driver.name}`
                              : "Unassigned"}
                            {" · "}
                            {analysis.reasons[0] ??
                              "Review the available operational evidence."}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={reviewHref}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/25 transition-colors hover:bg-indigo-700"
                      >
                        Review recovery
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {attentionDeliveries.length > visibleAttention.length && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
                +{attentionDeliveries.length - visibleAttention.length} more
                flagged deliveries — review them in{" "}
                <Link
                  href={`/dashboard/loads?organizationId=${encodeURIComponent(data.organization.id)}`}
                  className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  Loads
                </Link>
                .
              </p>
            )}
          </section>

          {/* Deliveries */}
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-cyan-100 bg-gradient-to-r from-cyan-50/80 to-white px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-800">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block h-2 w-2 rounded-[3px] bg-cyan-500 align-middle"
                  />
                  Delivery Monitor
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Status, ETA and current assignments
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone="neutral">
                  {displayedDeliveries.length} shown
                </Badge>
                <Link
                  href={`/dashboard/loads?organizationId=${encodeURIComponent(data.organization.id)}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  View all
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={`${tableHeadClass} px-5 py-3`}>Delivery</th>
                    <th className={`${tableHeadClass} px-5 py-3`}>Destination</th>
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
                        colSpan={6}
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
                      const riskLevel =
                        riskAnalyses.get(delivery.id)?.riskLevel;
                      const riskEdge =
                        riskLevel === "HIGH"
                          ? "border-l-red-500"
                          : riskLevel === "MEDIUM"
                            ? "border-l-amber-500"
                            : riskLevel === "LOW"
                              ? "border-l-emerald-500"
                              : "border-l-slate-200";
                      const riskRowTint =
                        riskLevel === "HIGH"
                          ? "bg-red-50/30"
                          : riskLevel === "MEDIUM"
                            ? "bg-amber-50/20"
                            : "";

                      return (
                        <tr
                          key={delivery.id}
                          className={`${tableRowClass} ${riskRowTint}`}
                        >
                          <td
                            className={`${tableCellClass} border-l-4 ${riskEdge} px-5 py-4`}
                          >
                            <div className="font-medium break-words">
                              {getDeliveryLabel(delivery)}
                            </div>
                          </td>

                          <td className={`${tableCellClass} px-5 py-4 text-slate-600`}>
                            <span className="break-words">
                              {delivery.recipientName ??
                                delivery.load.customerName}
                            </span>
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
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  riskLevel === "HIGH"
                                    ? "bg-red-500"
                                    : riskLevel === "MEDIUM"
                                      ? "bg-amber-500"
                                      : riskLevel === "LOW"
                                        ? "bg-emerald-500"
                                        : "bg-slate-300"
                                }`}
                                aria-hidden="true"
                              />
                              <StatusBadge
                                status={formatLabel(delivery.status)}
                              />
                            </span>
                          </td>

                          <td className={`${tableCellClass} whitespace-nowrap px-5 py-4 text-slate-600`}>
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
        {/* TRUXERA recovery intelligence */}
        <div className="order-3 min-w-0 overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/40 p-5 shadow-md xl:col-span-3">
          <div className="flex flex-col gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-[11px] font-bold text-white">
                  T
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                  TRUXERA Recovery Intelligence
                </p>
              </div>

              <h2 className="mt-2 text-xl font-bold text-slate-950">
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

          <ol className="mt-5 flex flex-wrap items-center gap-y-2">
            {intelligenceStages.map((stage, index) => (
              <li key={stage} className="flex items-center">
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className="mx-1.5 text-slate-300"
                  >
                    →
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold ${intelligenceStageStyles[stage].chip}`}
                >
                  <span
                    className={`font-mono text-[9px] ${intelligenceStageStyles[stage].index}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {stage}
                </span>
              </li>
            ))}
          </ol>

          <dl className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-indigo-100 bg-white/80 px-2.5 py-2 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                High risk
              </dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-red-600">
                {activeRiskSummary.HIGH}
              </dd>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-white/80 px-2.5 py-2 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Medium risk
              </dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-amber-600">
                {activeRiskSummary.MEDIUM}
              </dd>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-white/80 px-2.5 py-2 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Eligible swaps
              </dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-indigo-700">
                {activeRiskSummary.withEligibleReassignment}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-[11px] text-slate-500">
            TRUXERA workflow stages — shown as the product pipeline; stage
            state reflects recorded operational data only.
          </p>
        </div>
      </div>
    </TruckShell>
  );
}
