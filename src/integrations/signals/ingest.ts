import {
  isSignalKind,
  isSignalProvenance,
  isSignalSubjectKind,
  type SignalIngestInput,
  type SignalProvenance,
} from "./types.ts";

export type SignalIngestValidation =
  | { ok: true; input: SignalIngestInput }
  | { ok: false; error: string };

export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Validate and normalize a single signal ingest input. Clock-skew detection
 * is deferred to the store (needs ingestedAt); sourceTimestamp must parse.
 */
export function validateSignalInput(input: {
  subjectKind?: unknown;
  subjectId?: unknown;
  signalKind?: unknown;
  value?: unknown;
  provenance?: unknown;
  sourceTimestamp?: unknown;
  sequence?: unknown;
  eventId?: unknown;
  dedupeKey?: unknown;
}): SignalIngestValidation {
  if (!isSignalSubjectKind(input.subjectKind)) {
    return { ok: false, error: "invalid subjectKind" };
  }
  if (typeof input.subjectId !== "string" || input.subjectId.length === 0) {
    return { ok: false, error: "invalid subjectId" };
  }
  if (!isSignalKind(input.signalKind)) {
    return { ok: false, error: "invalid signalKind" };
  }
  if (!isSignalProvenance(input.provenance)) {
    return { ok: false, error: "invalid provenance" };
  }
  const sourceTimestamp =
    typeof input.sourceTimestamp === "string" ||
    input.sourceTimestamp instanceof Date
      ? new Date(input.sourceTimestamp)
      : null;
  if (!sourceTimestamp || Number.isNaN(sourceTimestamp.getTime())) {
    return { ok: false, error: "invalid sourceTimestamp" };
  }

  const sequence =
    typeof input.sequence === "number" && Number.isFinite(input.sequence)
      ? Math.trunc(input.sequence)
      : null;
  const optional = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

  return {
    ok: true,
    input: {
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      signalKind: input.signalKind,
      value: input.value ?? null,
      provenance: input.provenance as SignalProvenance,
      sourceTimestamp: sourceTimestamp.toISOString(),
      sequence,
      eventId: optional(input.eventId),
      dedupeKey: optional(input.dedupeKey),
    },
  };
}
