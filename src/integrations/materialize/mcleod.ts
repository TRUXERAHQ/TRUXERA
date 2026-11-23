import type {
  OperationalDeliveryFields,
  OperationalEntityMapper,
  OperationalLoadFields,
} from "./types.ts";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isoDate(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sanitizeReferencePart(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function deriveExternalLoadReference(
  providerKey: string,
  externalId: string,
): string {
  const provider = sanitizeReferencePart(providerKey);
  const budget = 64 - provider.length - 5; // "EXT-" + "-" separators
  const idPart = sanitizeReferencePart(externalId).slice(0, Math.max(8, budget));
  return `EXT-${provider}-${idPart}`.slice(0, 64);
}

export const mcleodOperationalMapper: OperationalEntityMapper = {
  mapLoad(payload) {
    const orderId = str(payload.orderId);
    if (!orderId) return null;

    const pickup = asRecord(payload.pickup);
    const pickupAddress = pickup ? str(pickup.location) : null;
    const customerName = str(payload.billToCustomerCode);

    if (!customerName || !pickupAddress) return null;

    const fields: OperationalLoadFields = {
      reference: deriveExternalLoadReference("mcleod-track-and-trace", orderId),
      customerName,
      pickupAddress,
      pickupWindowStart: pickup ? isoDate(pickup.scheduledArrivalEarly) : null,
      pickupWindowEnd: pickup ? isoDate(pickup.scheduledArrivalLate) : null,
    };
    return fields;
  },

  mapDelivery(payload) {
    const orderId = str(payload.orderId);
    if (!orderId) return null;

    const destinationAddress = str(payload.location);
    if (!destinationAddress) return null;

    const sequence =
      typeof payload.sequenceNumber === "number" &&
      Number.isFinite(payload.sequenceNumber)
        ? payload.sequenceNumber
        : null;

    const fields: OperationalDeliveryFields = {
      orderExternalId: orderId,
      destinationAddress,
      deliveryWindowStart: isoDate(payload.scheduledArrivalEarly),
      deliveryWindowEnd: isoDate(payload.scheduledArrivalLate),
      eta: isoDate(payload.eta),
      stopSortKey: sequence,
    };
    return fields;
  },
};
