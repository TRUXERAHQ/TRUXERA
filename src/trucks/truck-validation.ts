export const truckStatuses = [
  "AVAILABLE",
  "ON_ROUTE",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;

export type TruckStatus = (typeof truckStatuses)[number];

export type TruckInput = {
  unitNumber: string;
  vin: string | null;
  capacityKg: string | null;
  status: TruckStatus;
  currentLocation: string | null;
};

export type TruckInputResult =
  | { input: TruckInput; error?: never }
  | { input?: never; error: string };

function isTruckStatus(value: string): value is TruckStatus {
  return truckStatuses.some((status) => status === value);
}

export function parseTruckInput(formData: FormData): TruckInputResult {
  const unitNumberValue = formData.get("unitNumber");
  if (typeof unitNumberValue !== "string") {
    return { error: "Enter a unit number." };
  }

  const unitNumber = unitNumberValue.trim().toLocaleUpperCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,31}$/u.test(unitNumber)) {
    return {
      error:
        "Use 1–32 letters, numbers, spaces, periods, underscores, or hyphens for the unit number.",
    };
  }

  const vinValue = formData.get("vin");
  if (vinValue !== null && typeof vinValue !== "string") {
    return { error: "Enter a valid VIN." };
  }
  const vin = vinValue?.trim().toLocaleUpperCase() ?? "";
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return { error: "Enter a valid 17-character VIN, or leave it blank." };
  }

  const capacityValue = formData.get("capacityKg");
  if (capacityValue !== null && typeof capacityValue !== "string") {
    return { error: "Enter a valid capacity in kilograms." };
  }
  const capacityText = capacityValue?.trim() ?? "";
  if (
    capacityText &&
    (!/^(?:\d{1,9}|1000000000)(?:\.\d{1,3})?$/.test(capacityText) ||
      Number(capacityText) <= 0 ||
      Number(capacityText) > 1_000_000_000)
  ) {
    return {
      error: "Capacity must be greater than zero and no more than 1 billion kg.",
    };
  }

  const statusValue = formData.get("status");
  if (
    typeof statusValue !== "string" ||
    !isTruckStatus(statusValue)
  ) {
    return { error: "Select a valid truck status." };
  }

  const locationValue = formData.get("currentLocation");
  if (locationValue !== null && typeof locationValue !== "string") {
    return { error: "Enter a valid current location." };
  }
  const location = locationValue?.trim() ?? "";
  if (location.length > 200) {
    return { error: "Current location must be 200 characters or fewer." };
  }

  return {
    input: {
      unitNumber,
      vin: vin || null,
      capacityKg: capacityText || null,
      status: statusValue,
      currentLocation: location || null,
    },
  };
}
