export const SIGNAL_SUBJECT_KINDS = [
  "TRUCK",
  "DRIVER",
  "DELIVERY",
  "LOAD",
] as const;

export type SignalSubjectKind = (typeof SIGNAL_SUBJECT_KINDS)[number];

export function isSignalSubjectKind(value: unknown): value is SignalSubjectKind {
  return (
    typeof value === "string" &&
    (SIGNAL_SUBJECT_KINDS as readonly string[]).includes(value)
  );
}

export const SIGNAL_PROVENANCES = [
  "SOURCE_FACT",
  "NORMALIZED",
  "DERIVED",
] as const;

export type SignalProvenance = (typeof SIGNAL_PROVENANCES)[number];

export function isSignalProvenance(value: unknown): value is SignalProvenance {
  return (
    typeof value === "string" &&
    (SIGNAL_PROVENANCES as readonly string[]).includes(value)
  );
}

export const KNOWN_SIGNAL_KINDS = [
  "VEHICLE_LOCATION",
  "VEHICLE_MOTION_STATE",
  "DRIVER_DUTY_STATUS",
  "DRIVER_HOURS_REMAINING",
  "SOURCE_ETA",
  "ACTUAL_ARRIVAL",
  "ACTUAL_DEPARTURE",
  "SOURCE_STATUS",
] as const;

export type KnownSignalKind = (typeof KNOWN_SIGNAL_KINDS)[number];

const SIGNAL_KIND_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

export function isSignalKind(value: unknown): value is string {
  return typeof value === "string" && SIGNAL_KIND_PATTERN.test(value);
}

export type SignalIngestInput = {
  subjectKind: SignalSubjectKind;
  subjectId: string;
  signalKind: string;
  value: unknown;
  provenance: SignalProvenance;
  sourceTimestamp: string;
  sequence?: number | null;
  eventId?: string | null;
  dedupeKey?: string | null;
};

export type StoredSignal = {
  id: string;
  organizationId: string;
  integrationId: string | null;
  providerKey: string;
  subjectKind: SignalSubjectKind;
  subjectId: string;
  signalKind: string;
  value: string;
  provenance: SignalProvenance;
  sourceTimestamp: Date;
  ingestedAt: Date;
  sequence: number | null;
  eventId: string | null;
  dedupeKey: string;
  clockSkew: boolean;
};

export type ResolvedSignal = {
  subjectKind: SignalSubjectKind;
  subjectId: string;
  signalKind: string;
  value: unknown;
  provenance: SignalProvenance;
  providerKey: string;
  sourceTimestamp: string;
  ingestedAt: string;
  sequence: number | null;
  conflict: boolean;
  stale: boolean;
  clockSkewExcluded: boolean;
  alternatives: Array<{
    providerKey: string;
    value: unknown;
    sourceTimestamp: string;
    provenance: SignalProvenance;
  }>;
};
