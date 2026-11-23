import type { ExternalEntityKind } from "../types.ts";
import { resolveSharedField } from "./policy.ts";
import type {
  MaterializeRecordRef,
  MaterializeRepository,
  OperationalDeliveryFields,
  OperationalEntityMapper,
  OperationalLoadFields,
} from "./types.ts";

export type MaterializeOutcome = {
  mapped: number;
  updated: number;
  unchanged: number;
  failed: number;
};

const KIND_ORDER: Record<ExternalEntityKind, number> = {
  LOAD: 0,
  DELIVERY: 1,
  TRUCK: 2,
  DRIVER: 3,
  ASSIGNMENT: 4,
  CUSTOMER: 5,
};

function parsePayload(
  payload: string | null,
): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function dateField(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function comparableValue(
  raw: unknown,
  isDate: boolean,
): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  if (typeof raw === "string") {
    return isDate ? dateField(raw) : raw;
  }
  if (typeof raw === "number") return String(raw);
  return null;
}

function loadComparable(
  record: Record<string, unknown> | null,
  field: keyof OperationalLoadFields,
): string | null {
  if (!record) return null;
  return comparableValue(
    record[field],
    field === "pickupWindowStart" || field === "pickupWindowEnd",
  );
}

function deliveryComparable(
  record: Record<string, unknown> | null,
  field: keyof OperationalDeliveryFields,
): string | null {
  if (!record) return null;
  return comparableValue(
    record[field],
    field === "deliveryWindowStart" ||
      field === "deliveryWindowEnd" ||
      field === "eta",
  );
}

const LOAD_SHARED_FIELDS = [
  "customerName",
  "pickupAddress",
  "pickupWindowStart",
  "pickupWindowEnd",
] as const;

const DELIVERY_SHARED_FIELDS = [
  "destinationAddress",
  "deliveryWindowStart",
  "deliveryWindowEnd",
  "eta",
] as const;

export async function materializeExternalRecords(input: {
  repository: MaterializeRepository;
  mapper: OperationalEntityMapper;
  organizationId: string;
  integrationId: string;
  providerKey: string;
  refs: MaterializeRecordRef[];
}): Promise<MaterializeOutcome> {
  const { repository, mapper } = input;
  const outcome: MaterializeOutcome = {
    mapped: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };

  const sorted = [...input.refs].sort(
    (a, b) =>
      KIND_ORDER[a.entityKind] - KIND_ORDER[b.entityKind] ||
      a.externalId.localeCompare(b.externalId),
  );

  for (const ref of sorted) {
    if (ref.entityKind !== "LOAD" && ref.entityKind !== "DELIVERY") {
      continue;
    }
    try {
      const runRecord = <T>(
        fn: (repo: MaterializeRepository) => Promise<T>,
      ): Promise<T> =>
        repository.transaction
          ? repository.transaction(fn)
          : fn(repository);
      const result = await runRecord((repo) =>
        ref.entityKind === "LOAD"
          ? materializeLoad(repo, mapper, input, ref)
          : materializeDelivery(repo, mapper, input, ref),
      );
      if (result === "mapped") outcome.mapped += 1;
      else if (result === "updated") outcome.updated += 1;
      else outcome.unchanged += 1;
    } catch (error) {
      outcome.failed += 1;
      await repository.recordEvent({
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        kind: "EXTERNAL_RECORD_MAPPING_FAILED",
        message: `Failed to materialize ${ref.entityKind} "${ref.externalId}": ${
          error instanceof Error ? error.message.slice(0, 200) : "unknown error"
        }`,
        metadata: {
          providerKey: input.providerKey,
          entityKind: ref.entityKind,
          externalId: ref.externalId,
        },
      });
    }
  }

  return outcome;
}

async function materializeLoad(
  repository: MaterializeRepository,
  mapper: OperationalEntityMapper,
  ctx: {
    organizationId: string;
    integrationId: string;
    providerKey: string;
  },
  ref: MaterializeRecordRef,
): Promise<"mapped" | "updated" | "unchanged"> {
  const record = await repository.findExternalRecord({
    organizationId: ctx.organizationId,
    integrationId: ctx.integrationId,
    providerKey: ctx.providerKey,
    entityKind: "LOAD",
    externalId: ref.externalId,
  });
  if (!record) throw new Error("External record not found.");

  const payload = parsePayload(record.payload);
  if (!payload) throw new Error("External record payload is missing or invalid.");

  const fields = mapper.mapLoad(payload);
  if (!fields) {
    throw new Error("External load is missing required operational fields.");
  }

  const previousPayload = parsePayload(ref.previousPayload);
  const previousFields = previousPayload ? mapper.mapLoad(previousPayload) : null;

  if (record.internalId) {
    const existing = await repository.findLoadById({
      organizationId: ctx.organizationId,
      id: record.internalId,
    });
    if (!existing) {
      throw new Error("Linked load no longer exists.");
    }

    const updates: Partial<OperationalLoadFields> = {};
    const conflicts: string[] = [];
    for (const field of LOAD_SHARED_FIELDS) {
      const decision = resolveSharedField({
        dbValue: loadComparable(existing, field),
        previousExternalValue: previousFields?.[field] ?? null,
        newExternalValue: fields[field] ?? null,
      });
      if (decision.action === "write") {
        (updates as Record<string, unknown>)[field] = decision.value;
      } else if (decision.action === "keep-manual") {
        conflicts.push(field);
      }
    }

    if (Object.keys(updates).length === 0) {
      if (conflicts.length > 0) {
        await repository.recordEvent({
          organizationId: ctx.organizationId,
          integrationId: ctx.integrationId,
          kind: "EXTERNAL_RECORD_MAPPED",
          message: `External load "${ref.externalId}" unchanged; ${conflicts.length} field(s) preserved as manual edits.`,
          metadata: {
            providerKey: ctx.providerKey,
            entityKind: "LOAD",
            externalId: ref.externalId,
            internalId: record.internalId,
            preservedFields: conflicts,
          },
        });
      }
      return conflicts.length > 0 ? "updated" : "unchanged";
    }

    await repository.updateLoadFields({
      organizationId: ctx.organizationId,
      id: record.internalId,
      fields: updates,
    });
    await repository.recordEvent({
      organizationId: ctx.organizationId,
      integrationId: ctx.integrationId,
      kind: "EXTERNAL_RECORD_MAPPED",
      message: `External load "${ref.externalId}" updated ${Object.keys(updates).length} field(s).`,
      metadata: {
        providerKey: ctx.providerKey,
        entityKind: "LOAD",
        externalId: ref.externalId,
        internalId: record.internalId,
        updatedFields: Object.keys(updates),
        preservedFields: conflicts,
      },
    });
    return "updated";
  }

  const collision = await repository.findLoadByReference({
    organizationId: ctx.organizationId,
    reference: fields.reference,
  });
  if (collision) {
    throw new Error(
      `Load reference "${fields.reference}" already exists and is not linked to this external record.`,
    );
  }

  const created = await repository.createLoad({
    organizationId: ctx.organizationId,
    fields,
  });
  await repository.linkExternalRecord({
    organizationId: ctx.organizationId,
    recordId: record.id,
    internalKind: "Load",
    internalId: created.id,
  });
  await repository.recordEvent({
    organizationId: ctx.organizationId,
    integrationId: ctx.integrationId,
    kind: "EXTERNAL_RECORD_MAPPED",
    message: `External load "${ref.externalId}" materialized as load ${fields.reference}.`,
    metadata: {
      providerKey: ctx.providerKey,
      entityKind: "LOAD",
      externalId: ref.externalId,
      internalId: created.id,
    },
  });
  return "mapped";
}

async function materializeDelivery(
  repository: MaterializeRepository,
  mapper: OperationalEntityMapper,
  ctx: {
    organizationId: string;
    integrationId: string;
    providerKey: string;
  },
  ref: MaterializeRecordRef,
): Promise<"mapped" | "updated" | "unchanged"> {
  const record = await repository.findExternalRecord({
    organizationId: ctx.organizationId,
    integrationId: ctx.integrationId,
    providerKey: ctx.providerKey,
    entityKind: "DELIVERY",
    externalId: ref.externalId,
  });
  if (!record) throw new Error("External record not found.");

  const payload = parsePayload(record.payload);
  if (!payload) throw new Error("External record payload is missing or invalid.");

  const fields = mapper.mapDelivery(payload);
  if (!fields) {
    throw new Error("External delivery is missing required operational fields.");
  }

  // Resolve parent load through the sibling LOAD ExternalRecord link.
  const loadRecord = await repository.findExternalRecord({
    organizationId: ctx.organizationId,
    integrationId: ctx.integrationId,
    providerKey: ctx.providerKey,
    entityKind: "LOAD",
    externalId: fields.orderExternalId,
  });
  if (!loadRecord?.internalId) {
    throw new Error(
      `Parent external load "${fields.orderExternalId}" is not materialized yet.`,
    );
  }
  const load = await repository.findLoadById({
    organizationId: ctx.organizationId,
    id: loadRecord.internalId,
  });
  if (!load) throw new Error("Linked parent load no longer exists.");

  if (record.internalId) {
    const existing = await repository.findDeliveryById({
      organizationId: ctx.organizationId,
      id: record.internalId,
    });
    if (!existing) {
      throw new Error("Linked delivery no longer exists.");
    }

    const previousPayload = parsePayload(ref.previousPayload);
    const previousFields = previousPayload
      ? mapper.mapDelivery(previousPayload)
      : null;
    const updates: Partial<OperationalDeliveryFields> = {};
    const conflicts: string[] = [];
    for (const field of DELIVERY_SHARED_FIELDS) {
      const decision = resolveSharedField({
        dbValue: deliveryComparable(existing, field),
        previousExternalValue:
          (previousFields as Record<string, unknown> | null)?.[field] as
            | string
            | null
            | undefined ?? null,
        newExternalValue: (fields as Record<string, unknown>)[field] as
          | string
          | null,
      });
      if (decision.action === "write") {
        (updates as Record<string, unknown>)[field] = decision.value;
      } else if (decision.action === "keep-manual") {
        conflicts.push(field);
      }
    }

    if (Object.keys(updates).length === 0) {
      if (conflicts.length > 0) {
        await repository.recordEvent({
          organizationId: ctx.organizationId,
          integrationId: ctx.integrationId,
          kind: "EXTERNAL_RECORD_MAPPED",
          message: `External delivery "${ref.externalId}" unchanged; ${conflicts.length} field(s) preserved as manual edits.`,
          metadata: {
            providerKey: ctx.providerKey,
            entityKind: "DELIVERY",
            externalId: ref.externalId,
            internalId: record.internalId,
            preservedFields: conflicts,
          },
        });
      }
      return conflicts.length > 0 ? "updated" : "unchanged";
    }

    await repository.updateDeliveryFields({
      organizationId: ctx.organizationId,
      id: record.internalId,
      fields: updates,
    });
    await repository.recordEvent({
      organizationId: ctx.organizationId,
      integrationId: ctx.integrationId,
      kind: "EXTERNAL_RECORD_MAPPED",
      message: `External delivery "${ref.externalId}" updated ${Object.keys(updates).length} field(s).`,
      metadata: {
        providerKey: ctx.providerKey,
        entityKind: "DELIVERY",
        externalId: ref.externalId,
        internalId: record.internalId,
        updatedFields: Object.keys(updates),
        preservedFields: conflicts,
      },
    });
    return "updated";
  }

  const maxStop = await repository.maxDeliveryStopNumber({
    organizationId: ctx.organizationId,
    loadId: loadRecord.internalId,
  });
  const created = await repository.createDelivery({
    organizationId: ctx.organizationId,
    loadId: loadRecord.internalId,
    stopNumber: maxStop + 1,
    fields,
  });
  await repository.linkExternalRecord({
    organizationId: ctx.organizationId,
    recordId: record.id,
    internalKind: "Delivery",
    internalId: created.id,
  });
  await repository.recordEvent({
    organizationId: ctx.organizationId,
    integrationId: ctx.integrationId,
    kind: "EXTERNAL_RECORD_MAPPED",
    message: `External delivery "${ref.externalId}" materialized under load ${loadRecord.internalId}.`,
    metadata: {
      providerKey: ctx.providerKey,
      entityKind: "DELIVERY",
      externalId: ref.externalId,
      internalId: created.id,
      loadInternalId: loadRecord.internalId,
    },
  });
  return "mapped";
}
