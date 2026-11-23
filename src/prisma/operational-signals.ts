import { createHash } from "node:crypto";
import { connectDatabase, db } from "./db";
import {
  MAX_CLOCK_SKEW_MS,
  validateSignalInput,
} from "@/src/integrations/signals/ingest";
import {
  getSignalPolicy,
  groupSignalsByProvider,
  resolveSignalView,
  resolveWinner,
  valuesEqual,
} from "@/src/integrations/signals/policy";
import {
  isSignalSubjectKind,
  type ResolvedSignal,
  type SignalIngestInput,
  type SignalProvenance,
  type SignalSubjectKind,
  type StoredSignal,
} from "@/src/integrations/signals/types";
import {
  getFleetEntityExtractor,
  normalizeMatchKey,
} from "@/src/integrations/signals/entity-link";
import { isUuid } from "@/src/trucks/truck-policy";
import type { ExternalEntityKind } from "@/src/integrations/types";
import { getMembershipForUserInOrganization } from "./organization-data";
import { canReadIntegrations } from "@/src/integrations/policy";

export const SIGNAL_RAW_RETENTION_DAYS = 90;

export type SignalIngestOutcome =
  | { status: "stored"; signalId: string }
  | { status: "duplicate" }
  | { status: "rejected"; error: string };

function orderingKey(s: {
  sourceTimestamp: Date;
  ingestedAt: Date;
  sequence: number | null;
}): [number, number, number] {
  return [
    s.sourceTimestamp.getTime(),
    s.ingestedAt.getTime(),
    s.sequence ?? 0,
  ];
}

function isNewerSignal(
  a: { sourceTimestamp: Date; ingestedAt: Date; sequence: number | null },
  b: { sourceTimestamp: Date; ingestedAt: Date; sequence: number | null },
): boolean {
  const [aTs, aIn, aSeq] = orderingKey(a);
  const [bTs, bIn, bSeq] = orderingKey(b);
  return aTs > bTs || (aTs === bTs && (aIn > bIn || (aIn === bIn && aSeq > bSeq)));
}

/**
 * Append signals to the org-scoped append-only history and maintain the
 * per-provider latest-state projection. Idempotent on the org-scoped
 * uniqueness key; out-of-order signals are retained but never move latest
 * state backwards; clock-skewed signals are retained flagged and excluded
 * from resolution.
 */
export async function ingestOperationalSignals(input: {
  organizationId: string;
  integrationId: string | null;
  providerKey: string;
  signals: unknown[];
  now?: Date;
}): Promise<SignalIngestOutcome[]> {
  await connectDatabase();
  const now = input.now ?? new Date();
  const outcomes: SignalIngestOutcome[] = [];
  const touched = new Set<string>();

  for (const raw of input.signals) {
    const validated = validateSignalInput(
      typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>)
        : {},
    );
    if (!validated.ok) {
      outcomes.push({ status: "rejected", error: validated.error });
      continue;
    }
    const signal = validated.input;
    if (!isUuid(signal.subjectId)) {
      outcomes.push({ status: "rejected", error: "invalid subjectId" });
      continue;
    }

    const sourceTimestamp = new Date(signal.sourceTimestamp);
    const clockSkew = sourceTimestamp.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS;
    // Dedupe identity: explicit dedupeKey/eventId wins; otherwise derive a
    // content key so identical replays collapse but same-timestamp signals
    // carrying different values are still retained for audit.
    const dedupeKey =
      signal.dedupeKey ??
      signal.eventId ??
      createHash("sha256")
        .update(
          JSON.stringify({
            value: signal.value ?? null,
            sequence: signal.sequence ?? null,
          }),
        )
        .digest("hex")
        .slice(0, 32);

    let created;
    try {
      created = await db.orm.public.OperationalSignal.create({
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        providerKey: input.providerKey,
        subjectKind: signal.subjectKind,
        subjectId: signal.subjectId,
        signalKind: signal.signalKind,
        value: JSON.stringify(signal.value ?? null),
        provenance: signal.provenance,
        sourceTimestamp,
        ingestedAt: now,
        sequence: signal.sequence ?? null,
        eventId: signal.eventId ?? null,
        dedupeKey,
        clockSkew,
      });
    } catch {
      outcomes.push({ status: "duplicate" });
      continue;
    }

    outcomes.push({ status: "stored", signalId: created.id });
    touched.add(`${signal.subjectKind}|${signal.subjectId}|${signal.signalKind}`);

    if (!clockSkew) {
      await updateLatestProjection({
        organizationId: input.organizationId,
        providerKey: input.providerKey,
        signal,
        created,
      });
    }
  }

  for (const key of touched) {
    const [subjectKind, subjectId, signalKind] = key.split("|");
    await refreshConflictFlags({
      organizationId: input.organizationId,
      subjectKind: subjectKind as SignalSubjectKind,
      subjectId,
      signalKind,
    });
  }

  return outcomes;
}

async function updateLatestProjection(input: {
  organizationId: string;
  providerKey: string;
  signal: SignalIngestInput;
  created: {
    id: string;
    sourceTimestamp: Date;
    ingestedAt: Date;
    sequence: number | null;
    value: string;
    provenance: string;
  };
}): Promise<void> {
  const existing = await db.orm.public.OperationalSignalLatest.where({
    organizationId: input.organizationId,
    providerKey: input.providerKey,
    subjectKind: input.signal.subjectKind,
    subjectId: input.signal.subjectId,
    signalKind: input.signal.signalKind,
  }).first();

  if (existing) {
    const backing = await db.orm.public.OperationalSignal.where({
      id: existing.signalId,
    }).first();
    if (
      backing &&
      !isNewerSignal(
        {
          sourceTimestamp: input.created.sourceTimestamp,
          ingestedAt: input.created.ingestedAt,
          sequence: input.created.sequence,
        },
        backing,
      )
    ) {
      return; // out-of-order: retained in history, does not move latest state
    }
    await db.orm.public.OperationalSignalLatest.where({ id: existing.id }).update({
      signalId: input.created.id,
      sourceTimestamp: input.created.sourceTimestamp,
      value: input.created.value,
      provenance: input.created.provenance,
      conflict: existing.conflict,
    });
    return;
  }

  await db.orm.public.OperationalSignalLatest.create({
    organizationId: input.organizationId,
    providerKey: input.providerKey,
    subjectKind: input.signal.subjectKind,
    subjectId: input.signal.subjectId,
    signalKind: input.signal.signalKind,
    signalId: input.created.id,
    sourceTimestamp: input.created.sourceTimestamp,
    value: input.created.value,
    provenance: input.created.provenance,
  });
}

async function refreshConflictFlags(input: {
  organizationId: string;
  subjectKind: SignalSubjectKind;
  subjectId: string;
  signalKind: string;
}): Promise<void> {
  const latestRows = await db.orm.public.OperationalSignalLatest.where({
    organizationId: input.organizationId,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    signalKind: input.signalKind,
  }).all();
  if (latestRows.length < 2) {
    for (const row of latestRows) {
      if (row.conflict) {
        await db.orm.public.OperationalSignalLatest.where({ id: row.id }).update({
          conflict: false,
        });
      }
    }
    return;
  }

  const policy = getSignalPolicy(input.signalKind);
  const now = new Date();
  const signals: StoredSignal[] = latestRows.map((row) => ({
    id: row.signalId,
    organizationId: row.organizationId,
    integrationId: null,
    providerKey: row.providerKey,
    subjectKind: row.subjectKind as SignalSubjectKind,
    subjectId: row.subjectId,
    signalKind: row.signalKind,
    value: row.value,
    provenance: row.provenance as SignalProvenance,
    sourceTimestamp: row.sourceTimestamp,
    ingestedAt: row.updatedAt,
    sequence: null,
    eventId: null,
    dedupeKey: "",
    clockSkew: false,
  }));
  const { candidates } = groupSignalsByProvider(signals, policy, now);
  const outcome = resolveWinner(candidates, policy);
  if (outcome.status !== "RESOLVED") return;

  const winnerValue = outcome.winner.latest.value;
  const hasConflict = candidates.some(
    (c) => !valuesEqual(JSON.parse(c.latest.value), JSON.parse(winnerValue)),
  );

  const winnerParsed = JSON.parse(winnerValue);
  for (const row of latestRows) {
    const shouldConflict =
      hasConflict && !valuesEqual(JSON.parse(row.value), winnerParsed);
    if (row.conflict !== shouldConflict) {
      await db.orm.public.OperationalSignalLatest.where({ id: row.id }).update({
        conflict: shouldConflict,
      });
    }
  }
}

export type ResolvedSubjectSignals = {
  signals: ResolvedSignal[];
  skewedCount: number;
};

/**
 * Resolve the trusted current view for one subject. Reads the latest-state
 * projection (O(1) per provider) plus backing signal rows for ordering
 * metadata, then applies the vendor-neutral precedence/freshness policy.
 */
export async function resolveSignalsForSubject(input: {
  organizationId: string;
  subjectKind: SignalSubjectKind;
  subjectId: string;
  signalKind?: string;
  now?: Date;
}): Promise<ResolvedSubjectSignals> {
  await connectDatabase();
  const now = input.now ?? new Date();

  const latestRows = await db.orm.public.OperationalSignalLatest.where({
    organizationId: input.organizationId,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    ...(input.signalKind ? { signalKind: input.signalKind } : {}),
  }).all();

  if (latestRows.length === 0) return { signals: [], skewedCount: 0 };

  const backingIds = latestRows.map((row) => row.signalId);
  const backingCandidates = await db.orm.public.OperationalSignal.where(
    (s) => s.id.in(backingIds),
  ).all();
  // Defense-in-depth: latest rows are already org-scoped, but never trust a
  // signal id without re-verifying its organization.
  const backing = backingCandidates.filter(
    (s) => s.organizationId === input.organizationId,
  );
  const backingById = new Map(backing.map((s) => [s.id, s]));

  const byKind = new Map<string, StoredSignal[]>();
  let skewedCount = 0;
  for (const row of latestRows) {
    const s = backingById.get(row.signalId);
    if (!s) continue;
    const stored: StoredSignal = {
      id: s.id,
      organizationId: s.organizationId,
      integrationId: s.integrationId,
      providerKey: s.providerKey,
      subjectKind: s.subjectKind as SignalSubjectKind,
      subjectId: s.subjectId,
      signalKind: s.signalKind,
      value: s.value,
      provenance: s.provenance as SignalProvenance,
      sourceTimestamp: s.sourceTimestamp,
      ingestedAt: s.ingestedAt,
      sequence: s.sequence,
      eventId: s.eventId,
      dedupeKey: s.dedupeKey,
      clockSkew: s.clockSkew,
    };
    if (stored.clockSkew) {
      skewedCount += 1;
      continue;
    }
    const list = byKind.get(stored.signalKind) ?? [];
    list.push(stored);
    byKind.set(stored.signalKind, list);
  }

  const resolved: ResolvedSignal[] = [];
  for (const [signalKind, signals] of byKind) {
    const policy = getSignalPolicy(signalKind);
    const { view, skewedCount: kindSkewed } = resolveSignalView(
      signals,
      policy,
      now,
    );
    skewedCount += kindSkewed;
    if (!view) continue;
    resolved.push({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      ...view,
      provenance: view.provenance as SignalProvenance,
      alternatives: view.alternatives.map((a) => ({
        ...a,
        provenance: a.provenance as SignalProvenance,
      })),
    });
  }

  return { signals: resolved, skewedCount };
}

const SUBJECT_MODELS = {
  TRUCK: "Truck",
  DRIVER: "Driver",
  DELIVERY: "Delivery",
  LOAD: "Load",
} as const;

/**
 * Authorized read of resolved signals for one subject. Verifies membership,
 * integration-read permission, subject kind, and that the subject row itself
 * belongs to the organization before resolving.
 */
export async function resolveSignalsForSubjectAuthorized(input: {
  userId: string;
  organizationId: string;
  subjectKind: string;
  subjectId: string;
  signalKind?: string;
  now?: Date;
}): Promise<ResolvedSubjectSignals | null> {
  if (!isSignalSubjectKind(input.subjectKind) || !isUuid(input.subjectId)) {
    return null;
  }
  const membership = await getMembershipForUserInOrganization(
    input.userId,
    input.organizationId,
  );
  if (!membership || !canReadIntegrations(membership.role)) return null;

  await connectDatabase();
  const model = SUBJECT_MODELS[input.subjectKind];
  const subject = await (
    db.orm.public as unknown as Record<
      string,
      { where: (q: Record<string, string>) => { first: () => Promise<unknown> } }
    >
  )[model].where({ organizationId: input.organizationId, id: input.subjectId }).first();
  if (!subject) return null;

  return resolveSignalsForSubject({
    organizationId: input.organizationId,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    signalKind: input.signalKind,
    now: input.now,
  });
}

/**
 * 90-day raw-history retention. Deletes only OperationalSignal history rows;
 * OperationalSignalLatest keeps its denormalized current value and is never
 * touched. Extensible to org-configurable retention later.
 */
export async function pruneOperationalSignalHistory(input: {
  organizationId: string;
  olderThan: Date;
}): Promise<number> {
  await connectDatabase();
  const plan = db.raw.sql`
    DELETE FROM "OperationalSignal"
    WHERE "organizationId" = ${input.organizationId}
      AND "sourceTimestamp" < ${input.olderThan.toISOString()}
  `.affectedCount().build();
  const result = await db.execute(plan);
  return result.affectedRows ?? 0;
}

export type FleetLinkOutcome =
  | { status: "linked"; internalKind: "Truck" | "Driver"; internalId: string }
  | { status: "already-linked" }
  | { status: "unmatched" }
  | { status: "conflict"; internalId: string }
  | { status: "skipped"; reason: string };

/**
 * Deterministic identity-only entity linking for TRUCK/DRIVER external
 * records. Uses registered provider extractors; matches Truck by
 * unitNumber/vin and Driver by licenseNumber within the same organization.
 * Never writes Truck/Driver attributes, status, or assignments.
 */
export async function linkFleetEntities(input: {
  organizationId: string;
  integrationId: string;
  providerKey: string;
  refs: { entityKind: string; externalId: string; recordId: string }[];
}): Promise<FleetLinkOutcome[]> {
  await connectDatabase();
  const extractor = getFleetEntityExtractor(input.providerKey);
  if (!extractor) {
    return input.refs.map(() => ({
      status: "skipped",
      reason: "no extractor",
    }));
  }

  const outcomes: FleetLinkOutcome[] = [];
  for (const ref of input.refs) {
    if (ref.entityKind !== "TRUCK" && ref.entityKind !== "DRIVER") {
      outcomes.push({ status: "skipped", reason: "unsupported kind" });
      continue;
    }

    const record = await db.orm.public.ExternalRecord.where({
      organizationId: input.organizationId,
      id: ref.recordId,
    }).first();
    if (!record || !record.payload) {
      outcomes.push({ status: "skipped", reason: "record not found" });
      continue;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(record.payload) as Record<string, unknown>;
    } catch {
      outcomes.push({ status: "skipped", reason: "invalid payload" });
      continue;
    }

    const match = extractor({
      entityKind: ref.entityKind as ExternalEntityKind,
      payload,
    });
    if (!match || match.kind !== ref.entityKind) {
      outcomes.push({ status: "unmatched" });
      continue;
    }

    const internalKind = match.kind === "TRUCK" ? "Truck" : "Driver";
    let internalId: string | null = null;

    if (match.kind === "TRUCK") {
      const unitNumber = normalizeMatchKey(match.unitNumber);
      const vin = normalizeMatchKey(match.vin);
      const truck = unitNumber
        ? await db.orm.public.Truck.where({
            organizationId: input.organizationId,
            unitNumber,
          }).first()
        : vin
          ? await db.orm.public.Truck.where({
              organizationId: input.organizationId,
              vin,
            }).first()
          : null;
      internalId = truck?.id ?? null;
    } else {
      const licenseNumber = normalizeMatchKey(match.licenseNumber);
      const driver = licenseNumber
        ? await db.orm.public.Driver.where({
            organizationId: input.organizationId,
            licenseNumber,
          }).first()
        : null;
      internalId = driver?.id ?? null;
    }

    if (!internalId) {
      outcomes.push({ status: "unmatched" });
      continue;
    }

    if (record.internalId === internalId && record.internalKind === internalKind) {
      outcomes.push({ status: "already-linked" });
      continue;
    }
    if (record.internalId && record.internalId !== internalId) {
      outcomes.push({ status: "conflict", internalId: record.internalId });
      await db.orm.public.IntegrationEvent.create({
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        kind: "EXTERNAL_RECORD_MAPPING_FAILED" as never,
        message: `Fleet entity link conflict for ${ref.entityKind} ${ref.externalId}: already linked to ${record.internalKind} ${record.internalId}.`,
        metadata: JSON.stringify({
          entityKind: ref.entityKind,
          externalId: ref.externalId,
          recordId: ref.recordId,
          existingInternalId: record.internalId,
          candidateInternalId: internalId,
        }),
      });
      continue;
    }

    await db.orm.public.ExternalRecord.where({ id: record.id }).update({
      internalKind: internalKind as never,
      internalId,
    });
    await db.orm.public.IntegrationEvent.create({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      kind: "EXTERNAL_RECORD_MAPPED" as never,
      message: `Linked ${ref.entityKind} ${ref.externalId} to ${internalKind} ${internalId}.`,
      metadata: JSON.stringify({
        entityKind: ref.entityKind,
        externalId: ref.externalId,
        recordId: ref.recordId,
        internalKind,
        internalId,
      }),
    });
    outcomes.push({ status: "linked", internalKind: internalKind as "Truck" | "Driver", internalId });
  }

  return outcomes;
}
