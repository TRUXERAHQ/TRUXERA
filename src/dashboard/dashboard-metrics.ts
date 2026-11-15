const ACTIVE_DELIVERY_STATUSES = new Set([
  "PLANNED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
]);

type DeliveryStatus =
  | "PLANNED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";
type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

type DashboardDelivery = {
  id: string;
  loadId: string;
  status: DeliveryStatus;
  riskLevel: RiskLevel;
  load: { weightKg: number | string | null; reference: string };
};

type DashboardAssignment = {
  truckId: string;
  deliveryId: string;
};

export function getDashboardMetrics<
  TTruck extends {
    id: string;
    status: string;
    capacityKg: number | string | null;
  },
  TDriver extends { status: string },
  TDelivery extends DashboardDelivery,
  TAssignment extends DashboardAssignment,
>(data: {
  trucks: TTruck[];
  drivers: TDriver[];
  deliveries: TDelivery[];
  assignments: TAssignment[];
}) {
  const activeDeliveries = data.deliveries.filter((delivery) =>
    ACTIVE_DELIVERY_STATUSES.has(delivery.status),
  );
  const activeDeliveryIds = new Set(
    activeDeliveries.map((delivery) => delivery.id),
  );
  const activeAssignments = data.assignments.filter((assignment) =>
    activeDeliveryIds.has(assignment.deliveryId),
  );

  const deliveryStatusCounts: Record<DeliveryStatus, number> = {
    PLANNED: 0,
    ASSIGNED: 0,
    PICKED_UP: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
  const activeRiskCounts: Record<RiskLevel, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const delivery of data.deliveries) {
    deliveryStatusCounts[delivery.status] += 1;
  }
  for (const delivery of activeDeliveries) {
    activeRiskCounts[delivery.riskLevel] += 1;
  }

  const availableTrucks = data.trucks.filter(
    (truck) => truck.status === "AVAILABLE",
  ).length;

  return {
    activeDeliveries,
    activeAssignments,
    activeLoads: new Set(activeDeliveries.map((delivery) => delivery.loadId))
      .size,
    activeDrivers: data.drivers.filter(
      (driver) =>
        driver.status === "AVAILABLE" || driver.status === "ON_DUTY",
    ).length,
    availableTrucks,
    onRouteTrucks: data.trucks.filter(
      (truck) => truck.status === "ON_ROUTE",
    ).length,
    maintenanceTrucks: data.trucks.filter(
      (truck) => truck.status === "MAINTENANCE",
    ).length,
    outOfServiceTrucks: data.trucks.filter(
      (truck) => truck.status === "OUT_OF_SERVICE",
    ).length,
    fleetAvailability: data.trucks.length
      ? Math.round((availableTrucks / data.trucks.length) * 100)
      : null,
    deliveryStatusCounts,
    activeRiskCounts,
  };
}

export function getTruckCapacityUtilizationPercent(
  truck: { capacityKg: number | string | null },
  assignments: readonly DashboardAssignment[],
  deliveriesById: ReadonlyMap<string, DashboardDelivery>,
) {
  if (truck.capacityKg === null || assignments.length !== 1) return null;

  const delivery = deliveriesById.get(assignments[0].deliveryId);
  const weight = delivery?.load.weightKg;
  if (weight === null || weight === undefined) return null;

  const capacityValue = Number(truck.capacityKg);
  const weightValue = Number(weight);
  if (
    !Number.isFinite(capacityValue) ||
    !Number.isFinite(weightValue) ||
    capacityValue <= 0 ||
    weightValue < 0
  ) {
    return null;
  }

  return Math.round((weightValue / capacityValue) * 100);
}
