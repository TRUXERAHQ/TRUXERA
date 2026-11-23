export type FieldOwnership =
  | "EXTERNAL_OWNED"
  | "SHARED_REFRESHED"
  | "TRUXERA_OWNED";

export type SharedFieldDecision =
  | { action: "write"; value: string | null }
  | { action: "noop" }
  | { action: "keep-manual" };

function normalizeComparable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decide whether an externally-refreshed field may be written.
 *
 * External source owns the field only while the operational record still
 * holds the value the source last wrote (or the field is still empty).
 * If a user edited the field since the last external sync — i.e. the
 * current value differs from both the previous external value and the new
 * external value — the manual value wins and the field is preserved.
 */
export function resolveSharedField(input: {
  dbValue: string | null;
  previousExternalValue: string | null;
  newExternalValue: string | null;
}): SharedFieldDecision {
  const db = normalizeComparable(input.dbValue);
  const previous = normalizeComparable(input.previousExternalValue);
  const next = normalizeComparable(input.newExternalValue);

  if (db === next) return { action: "noop" };
  if (db === previous) return { action: "write", value: next };
  return { action: "keep-manual" };
}

export const LOAD_FIELD_OWNERSHIP = {
  reference: "EXTERNAL_OWNED",
  customerName: "SHARED_REFRESHED",
  pickupAddress: "SHARED_REFRESHED",
  pickupWindowStart: "SHARED_REFRESHED",
  pickupWindowEnd: "SHARED_REFRESHED",
  cargoDescription: "TRUXERA_OWNED",
  weightKg: "TRUXERA_OWNED",
} as const satisfies Record<string, FieldOwnership>;

export const DELIVERY_FIELD_OWNERSHIP = {
  destinationAddress: "SHARED_REFRESHED",
  deliveryWindowStart: "SHARED_REFRESHED",
  deliveryWindowEnd: "SHARED_REFRESHED",
  eta: "SHARED_REFRESHED",
  status: "TRUXERA_OWNED",
  riskLevel: "TRUXERA_OWNED",
  deliveredAt: "TRUXERA_OWNED",
  recipientName: "TRUXERA_OWNED",
  reference: "TRUXERA_OWNED",
} as const satisfies Record<string, FieldOwnership>;
