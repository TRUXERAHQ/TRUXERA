export type FleetMembership = {
  organizationId: string;
  role: string;
};

const fleetManagerRoles = new Set(["OWNER", "ADMIN", "DISPATCHER"]);

export function canManageFleet(role: string) {
  return fleetManagerRoles.has(role);
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function authorizeFleetAccess(
  membership: FleetMembership | null | undefined,
  requestedOrganizationId: string,
  write = false,
) {
  if (!membership || membership.organizationId !== requestedOrganizationId) {
    return false;
  }

  return !write || canManageFleet(membership.role);
}

export function hasDuplicateUnitNumber(
  trucks: Array<{ id: string; unitNumber: string }>,
  unitNumber: string,
  excludingTruckId?: string,
) {
  const normalized = unitNumber.trim().toLocaleUpperCase();

  return trucks.some(
    (truck) =>
      truck.id !== excludingTruckId &&
      truck.unitNumber.trim().toLocaleUpperCase() === normalized,
  );
}
