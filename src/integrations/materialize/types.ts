import type { ExternalEntityKind } from "../types.ts";
import type { ExternalRef } from "../identity.ts";

export type OperationalLoadFields = {
  reference: string;
  customerName: string | null;
  pickupAddress: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
};

export type OperationalDeliveryFields = {
  orderExternalId: string;
  destinationAddress: string | null;
  deliveryWindowStart: string | null;
  deliveryWindowEnd: string | null;
  eta: string | null;
  stopSortKey: number | null;
};

export type OperationalEntityMapper = {
  mapLoad(payload: Record<string, unknown>): OperationalLoadFields | null;
  mapDelivery(
    payload: Record<string, unknown>,
  ): OperationalDeliveryFields | null;
};

export type MaterializeRecordRef = ExternalRef & {
  recordId: string;
  previousPayload: string | null;
};

export type MaterializeRepository = {
  findExternalRecord(ref: {
    organizationId: string;
    integrationId: string;
    providerKey: string;
    entityKind: ExternalEntityKind;
    externalId: string;
  }): Promise<{
    id: string;
    internalKind: string | null;
    internalId: string | null;
    payload: string | null;
  } | null>;

  findLoadById(input: {
    organizationId: string;
    id: string;
  }): Promise<Record<string, unknown> | null>;

  findLoadByReference(input: {
    organizationId: string;
    reference: string;
  }): Promise<{ id: string } | null>;

  createLoad(input: {
    organizationId: string;
    fields: OperationalLoadFields;
  }): Promise<{ id: string }>;

  updateLoadFields(input: {
    organizationId: string;
    id: string;
    fields: Partial<OperationalLoadFields>;
  }): Promise<void>;

  findDeliveryById(input: {
    organizationId: string;
    id: string;
  }): Promise<Record<string, unknown> | null>;

  createDelivery(input: {
    organizationId: string;
    loadId: string;
    stopNumber: number;
    fields: OperationalDeliveryFields;
  }): Promise<{ id: string }>;

  updateDeliveryFields(input: {
    organizationId: string;
    id: string;
    fields: Partial<OperationalDeliveryFields>;
  }): Promise<void>;

  maxDeliveryStopNumber(input: {
    organizationId: string;
    loadId: string;
  }): Promise<number>;

  linkExternalRecord(input: {
    organizationId: string;
    recordId: string;
    internalKind: "Load" | "Delivery";
    internalId: string;
  }): Promise<void>;

  recordEvent(input: {
    organizationId: string;
    integrationId: string;
    kind: "EXTERNAL_RECORD_MAPPED" | "EXTERNAL_RECORD_MAPPING_FAILED";
    message: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;

  transaction?<T>(
    fn: (repo: MaterializeRepository) => Promise<T>,
  ): Promise<T>;
};
