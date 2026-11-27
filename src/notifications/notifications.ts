import { connectDatabase, db } from "../prisma/db";
import { getMembershipForUserInOrganization } from "../prisma/organization-data";
import { getDispatchBoardForOrganization } from "../prisma/operations-data";
import { getReliabilityOverviewForUser } from "../prisma/reliability-data";
import { analyzeDeliveryRisksForOrganization } from "../fleet/delivery-risk";

export type NotificationCategory =
  | "high-risk"
  | "recovery-recommendation"
  | "recovery-completed"
  | "integration-issue"
  | "system";

export type NotificationTone =
  | "danger"
  | "warning"
  | "info"
  | "success"
  | "intelligence";

export type AppNotification = {
  id: string;
  category: NotificationCategory;
  categoryLabel: string;
  title: string;
  body: string;
  href: string;
  /** ISO timestamp of the underlying operational event. */
  updatedAt: string;
  tone: NotificationTone;
};

const ACTIVE_DELIVERY_STATUSES = new Set([
  "PLANNED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
]);

const RECOVERY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const TRIAL_WARNING_MS = 7 * 24 * 60 * 60 * 1000;
const REASSIGNMENT_PREFIX = "Reassigned from truck ";
const MAX_NOTIFICATIONS = 50;

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  "high-risk": "High Risk",
  "recovery-recommendation": "Recovery Recommendation",
  "recovery-completed": "Recovery Completed",
  "integration-issue": "Integration Issue",
  system: "System / Account",
};

function deliveryLabel(delivery: {
  reference: string | null;
  stopNumber: number;
  load: { reference: string | null } | null;
}) {
  return (
    delivery.reference ??
    `${delivery.load?.reference ?? "Load"} · Stop ${delivery.stopNumber}`
  );
}

function latestEventAtByDelivery(
  events: { deliveryId: string; occurredAt: Date }[],
) {
  const map = new Map<string, number>();
  for (const event of events) {
    const time = event.occurredAt.getTime();
    if (time > (map.get(event.deliveryId) ?? 0)) {
      map.set(event.deliveryId, time);
    }
  }
  return map;
}

/**
 * Derives the organization's current notifications from real operational
 * records. Nothing is fabricated: every item maps to an actual high-risk
 * delivery, recovery recommendation/action, integration health state, or
 * account/billing state. Read/unread state is intentionally not stored
 * here — it is client-side so no schema change is required.
 *
 * Returns null when the user has no membership in the organization.
 */
export async function getNotificationsForOrganization(input: {
  userId: string;
  organizationId: string;
  now?: Date;
}): Promise<AppNotification[] | null> {
  const { userId, organizationId } = input;
  const now = input.now ?? new Date();

  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!membership) return null;

  await connectDatabase();

  const [board, reliability, subscription, organization, integrations] =
    await Promise.all([
      getDispatchBoardForOrganization(userId, organizationId),
      getReliabilityOverviewForUser(userId, organizationId, now),
      db.orm.public.BillingSubscription.where({ organizationId }).first(),
      db.orm.public.Organization.where({ id: organizationId }).first(),
      db.orm.public.Integration.where({ organizationId }).all(),
    ]);

  if (!board || !organization) return [];

  const orgQuery = `organizationId=${encodeURIComponent(organizationId)}`;
  const notifications: AppNotification[] = [];

  // --- Operational: high risk + recovery recommendations -----------------
  const riskAssignments = board.assignments.flatMap((assignment) =>
    assignment.delivery
      ? [
          {
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
          },
        ]
      : [],
  );

  const riskAnalyses = new Map(
    analyzeDeliveryRisksForOrganization({
      organizationId,
      analyzedAt: now,
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

  const activeDeliveries = board.deliveries.filter((delivery) =>
    ACTIVE_DELIVERY_STATUSES.has(delivery.status),
  );
  const eventTimes = latestEventAtByDelivery(board.events);

  for (const delivery of activeDeliveries) {
    const analysis = riskAnalyses.get(delivery.id);
    if (!analysis) continue;
    const updatedAt = new Date(
      eventTimes.get(delivery.id) ?? delivery.updatedAt.getTime(),
    ).toISOString();
    const label = deliveryLabel(delivery);
    const recommended = analysis.intervention.recommended;
    const recommendationText = recommended
      ? ` Recommended recovery: ${recommended.truckUnitNumber} with ${recommended.driverName}.`
      : "";

    if (analysis.riskLevel === "HIGH") {
      notifications.push({
        id: `high-risk:${delivery.id}`,
        category: "high-risk",
        categoryLabel: CATEGORY_LABELS["high-risk"],
        title: `High-risk delivery: ${label}`,
        body: `${analysis.reasons[0] ?? "Delivery assessed HIGH risk."}${recommendationText}`,
        href: `/dashboard/command-center?${orgQuery}`,
        updatedAt,
        tone: "danger",
      });
    } else if (
      analysis.intervention.required &&
      analysis.intervention.recommended
    ) {
      notifications.push({
        id: `recovery-recommendation:${delivery.id}`,
        category: "recovery-recommendation",
        categoryLabel: CATEGORY_LABELS["recovery-recommendation"],
        title: `Recovery recommendation: ${label}`,
        body: `TRUXERA recommends ${recommended!.truckUnitNumber} with ${recommended!.driverName}.`,
        href: `/dashboard/command-center?${orgQuery}`,
        updatedAt,
        tone: "intelligence",
      });
    }
  }

  // --- Operational: completed recoveries (recorded reassignments) --------
  const recoveryCutoff = now.getTime() - RECOVERY_WINDOW_MS;
  for (const assignment of board.assignments) {
    if (
      !assignment.endedAt ||
      assignment.endedAt.getTime() < recoveryCutoff ||
      !assignment.endReason?.startsWith(REASSIGNMENT_PREFIX)
    ) {
      continue;
    }
    notifications.push({
      id: `recovery-completed:${assignment.id}`,
      category: "recovery-completed",
      categoryLabel: CATEGORY_LABELS["recovery-completed"],
      title: "Recovery completed",
      body: assignment.endReason.slice(0, 160),
      href: `/dashboard/operational-history?${orgQuery}`,
      updatedAt: assignment.endedAt.toISOString(),
      tone: "success",
    });
  }

  // --- Integrations -------------------------------------------------------
  if (reliability) {
    const integrationUpdatedAt = new Map(
      integrations.map((integration) => [
        integration.id,
        integration.updatedAt?.getTime() ?? null,
      ]),
    );
    for (const view of reliability.integrations) {
      if (view.reliability === "HEALTHY") continue;
      const updatedAt = new Date(
        view.lastSyncAt
          ? Date.parse(view.lastSyncAt)
          : (integrationUpdatedAt.get(view.integrationId) ?? now.getTime()),
      ).toISOString();
      notifications.push({
        id: `integration-issue:${view.integrationId}`,
        category: "integration-issue",
        categoryLabel: CATEGORY_LABELS["integration-issue"],
        title: `Integration issue: ${view.displayName}`,
        body:
          view.lastSyncError ??
          view.sync.errorSummary ??
          `Reliability state: ${view.reliability}.`,
        href: `/dashboard/settings?${orgQuery}`,
        updatedAt,
        tone:
          view.reliability === "DISCONNECTED" ||
          view.reliability === "FAILED"
            ? "danger"
            : "warning",
      });
    }
  }

  // --- System / account ----------------------------------------------------
  if (organization.status !== "ACTIVE") {
    notifications.push({
      id: "system:account-status",
      category: "system",
      categoryLabel: CATEGORY_LABELS.system,
      title: "Account status changed",
      body: `This organization is ${organization.status.toLowerCase().replaceAll("_", " ")}. Some actions may be restricted.`,
      href: `/dashboard/settings?${orgQuery}`,
      updatedAt: (organization.updatedAt ?? now).toISOString(),
      tone: "danger",
    });
  }

  if (subscription) {
    if (subscription.status === "PAUSED" || subscription.status === "CANCELED") {
      notifications.push({
        id: "system:billing-status",
        category: "system",
        categoryLabel: CATEGORY_LABELS.system,
        title: "Subscription needs attention",
        body: `The ${subscription.plan} subscription is ${subscription.status.toLowerCase()}. Review billing to restore service.`,
        href: `/dashboard/billing?${orgQuery}`,
        updatedAt: subscription.updatedAt.toISOString(),
        tone: "warning",
      });
    } else if (
      subscription.status === "TRIAL" &&
      subscription.trialEndAt &&
      subscription.trialEndAt.getTime() - now.getTime() <= TRIAL_WARNING_MS &&
      subscription.trialEndAt.getTime() > now.getTime()
    ) {
      notifications.push({
        id: "system:trial-ending",
        category: "system",
        categoryLabel: CATEGORY_LABELS.system,
        title: "Trial ending soon",
        body: `Your trial ends on ${subscription.trialEndAt.toISOString().slice(0, 10)}. Choose a plan to keep full access.`,
        href: `/dashboard/billing?${orgQuery}`,
        updatedAt: subscription.trialEndAt.toISOString(),
        tone: "info",
      });
    }
  }

  return notifications
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_NOTIFICATIONS);
}
