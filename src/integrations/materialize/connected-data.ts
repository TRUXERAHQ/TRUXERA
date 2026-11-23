import { connectDatabase, db } from "../../prisma/db.ts";
import type {
  MaterializeRepository,
  OperationalDeliveryFields,
  OperationalLoadFields,
} from "./types.ts";

type Executor = Pick<typeof db, "orm">;

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const LOAD_FIELDS = [
  "reference",
  "customerName",
  "pickupAddress",
  "pickupWindowStart",
  "pickupWindowEnd",
] as const;

const DELIVERY_FIELDS = [
  "destinationAddress",
  "deliveryWindowStart",
  "deliveryWindowEnd",
  "eta",
] as const;

export function createConnectedDataRepository(
  executor?: Executor,
): MaterializeRepository {
  const orm = () => (executor ?? db).orm;

  return {
    async findExternalRecord({ organizationId, integrationId, providerKey, entityKind, externalId }) {
      await connectDatabase();
      return orm().public.ExternalRecord.where({
        organizationId,
        integrationId,
        providerKey,
        entityKind: entityKind as never,
        externalId,
      }).first();
    },

    async findLoadById({ organizationId, id }) {
      await connectDatabase();
      return orm().public.Load.where({ organizationId, id }).first();
    },

    async findLoadByReference({ organizationId, reference }) {
      await connectDatabase();
      return orm().public.Load.where({ organizationId, reference })
        .select("id")
        .first();
    },

    async createLoad({ organizationId, fields }) {
      await connectDatabase();
      if (!fields.customerName || !fields.pickupAddress) {
        throw new Error("External load is missing required fields.");
      }
      const row = await orm().public.Load.create({
        organizationId,
        reference: fields.reference,
        customerName: fields.customerName,
        pickupAddress: fields.pickupAddress,
        pickupWindowStart: toDateOrNull(fields.pickupWindowStart),
        pickupWindowEnd: toDateOrNull(fields.pickupWindowEnd),
        cargoDescription: null,
        weightKg: null,
      });
      return { id: row.id };
    },

    async updateLoadFields({ organizationId, id, fields }) {
      await connectDatabase();
      const update: Record<string, unknown> = {};
      for (const key of LOAD_FIELDS) {
        if (key in fields) {
          update[key] =
            key === "pickupWindowStart" || key === "pickupWindowEnd"
              ? toDateOrNull(fields[key])
              : fields[key];
        }
      }
      if (Object.keys(update).length === 0) return;
      await orm().public.Load.where({ organizationId, id }).update(update as never);
    },

    async findDeliveryById({ organizationId, id }) {
      await connectDatabase();
      return orm().public.Delivery.where({ organizationId, id }).first();
    },

    async createDelivery({ organizationId, loadId, stopNumber, fields }) {
      await connectDatabase();
      if (!fields.destinationAddress) {
        throw new Error("External delivery is missing required fields.");
      }
      const row = await orm().public.Delivery.create({
        organizationId,
        loadId,
        stopNumber,
        reference: null,
        recipientName: null,
        destinationAddress: fields.destinationAddress,
        deliveryWindowStart: toDateOrNull(fields.deliveryWindowStart),
        deliveryWindowEnd: toDateOrNull(fields.deliveryWindowEnd),
        eta: toDateOrNull(fields.eta),
        status: "PLANNED",
        riskLevel: "LOW",
        deliveredAt: null,
      });
      await orm().public.DeliveryEvent.create({
        organizationId,
        deliveryId: row.id,
        actorUserId: null,
        type: "STATUS_CHANGED",
        fromStatus: null,
        toStatus: "PLANNED",
        note: "Delivery materialized from connected external record.",
        location: null,
      });
      return { id: row.id };
    },

    async updateDeliveryFields({ organizationId, id, fields }) {
      await connectDatabase();
      const update: Record<string, unknown> = {};
      for (const key of DELIVERY_FIELDS) {
        if (key in fields) {
          update[key] =
            key === "deliveryWindowStart" ||
            key === "deliveryWindowEnd" ||
            key === "eta"
              ? toDateOrNull(fields[key])
              : fields[key];
        }
      }
      if (Object.keys(update).length === 0) return;
      await orm().public.Delivery.where({ organizationId, id }).update(update as never);
    },

    async maxDeliveryStopNumber({ organizationId, loadId }) {
      await connectDatabase();
      const rows = await orm().public.Delivery.where({ organizationId, loadId })
        .select("stopNumber")
        .all();
      return rows.reduce((max, row) => Math.max(max, row.stopNumber), 0);
    },

    async linkExternalRecord({ organizationId, recordId, internalKind, internalId }) {
      await connectDatabase();
      await orm().public.ExternalRecord.where({
        organizationId,
        id: recordId,
      }).update({ internalKind, internalId });
    },

    async recordEvent({ organizationId, integrationId, kind, message, metadata }) {
      await connectDatabase();
      await orm().public.IntegrationEvent.create({
        organizationId,
        integrationId,
        actorUserId: null,
        kind: kind as never,
        message,
        metadata: JSON.stringify(metadata),
      });
    },

    async transaction<T>(fn: (repo: MaterializeRepository) => Promise<T>) {
      await connectDatabase();
      return db.transaction(async (tx) => fn(createConnectedDataRepository(tx)));
    },
  };
}

export type { OperationalLoadFields, OperationalDeliveryFields };
