import { randomUUID } from "node:crypto";
import type {
  ConnectionCheck,
  ConnectionContext,
  ConnectorDescriptor,
  FetchResult,
  IntegrationConnector,
  SyncContext,
} from "../connector.ts";
import type { IntegrationCredentialPayload } from "../auth.ts";
import { IntegrationError, redactSecrets } from "../errors.ts";
import type { NormalizedEntity } from "../normalize.ts";

export const MCLEOD_TNT_PROVIDER_KEY = "mcleod-track-and-trace";
export const MCLEOD_TNT_SANDBOX_BASE_URL =
  "https://api.mcleodsoftware.com/trackandtrace-sandbox";
export const MCLEOD_TNT_DEFAULT_TENANT = "2";

const ORDER_STATUSES = [
  "Available",
  "Scheduled",
  "InProgress",
  "Delivered",
  "Void",
  "Quote",
] as const;

const MAX_PAGES = 200;
const MAX_ORDERS_PER_SYNC = 5000;

export type McLeodFetchResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type McLeodFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<McLeodFetchResponse>;

export type McLeodClient = {
  get(path: string, signal?: AbortSignal): Promise<{
    status: number;
    headers: { get(name: string): string | null };
    body: unknown;
  }>;
};

export function createMcLeodClient(input: {
  baseUrl: string;
  tenantId: string;
  apiKey: string;
  accessToken: string;
  fetchImpl?: McLeodFetch;
}): McLeodClient {
  const fetchImpl: McLeodFetch =
    input.fetchImpl ??
    ((url, init) => fetch(url, init) as Promise<McLeodFetchResponse>);
  const baseUrl = input.baseUrl.replace(/\/+$/, "");

  function headers(): Record<string, string> {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
      "X-Api-Key": input.apiKey,
      "X-Mcld-Tenant": input.tenantId,
      "X-Correlation-Id": randomUUID(),
    };
  }

  return {
    async get(path, signal) {
      let response: McLeodFetchResponse;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method: "GET",
          headers: headers(),
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        throw new IntegrationError(
          "NETWORK_FAILURE",
          `McLeod Track & Trace request failed: ${redactSecrets(
            error instanceof Error ? error.message : "network error",
          ).slice(0, 200)}`,
        );
      }

      let body: unknown = null;
      if (response.status !== 204) {
        try {
          body = await response.json();
        } catch {
          throw new IntegrationError(
            "INVALID_PAYLOAD",
            "McLeod Track & Trace returned a non-JSON response.",
          );
        }
      }

      return { status: response.status, headers: response.headers, body };
    },
  };
}

export function assertMcLeodOk(
  status: number,
  what: string,
): void {
  if (status >= 200 && status < 300) return;
  if (status === 401) {
    throw new IntegrationError(
      "AUTHENTICATION_FAILED",
      `McLeod Track & Trace rejected credentials for ${what} (401).`,
    );
  }
  if (status === 403) {
    throw new IntegrationError(
      "AUTHORIZATION_FAILED",
      `McLeod Track & Trace denied access for ${what} (403).`,
    );
  }
  if (status === 429) {
    throw new IntegrationError(
      "RATE_LIMITED",
      `McLeod Track & Trace rate limited ${what} (429).`,
    );
  }
  if (status >= 500) {
    throw new IntegrationError(
      "PROVIDER_UNAVAILABLE",
      `McLeod Track & Trace is unavailable for ${what} (${status}).`,
    );
  }
  throw new IntegrationError(
    "PROVIDER_ERROR",
    `McLeod Track & Trace request for ${what} failed with status ${status}.`,
  );
}

type McLeodConfig = {
  baseUrl: string;
  tenantId: string;
  orderStatus: string | null;
  fetchOrderDetail: boolean;
};

function resolveConfig(ctx: ConnectionContext): McLeodConfig {
  const config = ctx.config ?? {};
  const rawBaseUrl =
    typeof config.baseUrl === "string" && config.baseUrl.trim()
      ? config.baseUrl.trim()
      : MCLEOD_TNT_SANDBOX_BASE_URL;
  let baseUrl = rawBaseUrl;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("bad protocol");
    }
    baseUrl = parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new IntegrationError(
      "VALIDATION_FAILURE",
      "McLeod Track & Trace base URL is not a valid URL.",
    );
  }

  const tenantId =
    typeof config.tenantId === "string" && config.tenantId.trim()
      ? config.tenantId.trim()
      : MCLEOD_TNT_DEFAULT_TENANT;

  const orderStatus =
    typeof config.orderStatus === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(config.orderStatus)
      ? config.orderStatus
      : null;

  return {
    baseUrl,
    tenantId,
    orderStatus,
    fetchOrderDetail: config.fetchOrderDetail !== false,
  };
}

function requireCredential(
  credential: IntegrationCredentialPayload | null,
): { apiKey: string; accessToken: string } {
  if (!credential || credential.kind !== "API_KEY_BEARER") {
    throw new IntegrationError(
      "CREDENTIAL_UNAVAILABLE",
      "McLeod Track & Trace requires an API key + bearer token credential.",
    );
  }
  return { apiKey: credential.apiKey, accessToken: credential.accessToken };
}

export function extractMcLeodOrderList(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  const record = asRecord(body);
  if (record && Array.isArray(record.items)) return record.items;
  if (record && Array.isArray(record.orders)) return record.orders;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeStop(
  stop: unknown,
  role: "shipper" | "consignee" | "intermediate",
): Record<string, unknown> | null {
  const record = asRecord(stop);
  if (!record) return null;

  const city = str(record.city);
  const state = str(record.state);
  const postalCode = str(record.postalCode);
  const locationParts = [city, state].filter(Boolean).join(", ");
  const location =
    [locationParts, postalCode].filter(Boolean).join(" ") || null;

  const referenceNumbers = Array.isArray(record.referenceNumbers)
    ? record.referenceNumbers
        .map((entry) => {
          const ref = asRecord(entry);
          if (!ref) return null;
          return {
            qualifierCode: str(ref.qualifierCode),
            referenceNumber: str(ref.referenceNumber),
          };
        })
        .filter(
          (entry): entry is { qualifierCode: string | null; referenceNumber: string | null } =>
            entry !== null,
        )
    : null;

  return {
    stopRole: role,
    sequenceNumber: num(record.sequenceNumber),
    city,
    state,
    postalCode,
    location,
    latitude: num(record.latitude),
    longitude: num(record.longitude),
    eta: str(record.eta),
    scheduledArrivalEarly: str(record.scheduledArrivalEarly),
    scheduledArrivalLate: str(record.scheduledArrivalLate),
    actualArrival: str(record.actualArrivalEarly),
    actualDeparture: str(record.actualArrivalLate),
    appointmentRequired: bool(record.appointmentRequired),
    appointmentConfirmed: bool(record.appointmentConfirmed),
    referenceNumbers,
  };
}

function normalizeProgressUpdate(
  update: unknown,
): Record<string, unknown> | null {
  const record = asRecord(update);
  if (!record) return null;
  const position = asRecord(record.position);
  return {
    event: str(record.event),
    timestamp: str(record.timestamp),
    milesToConsignee: num(record.milesToConsignee),
    position: position
      ? {
          latitude: num(position.latitude),
          longitude: num(position.longitude),
          city: str(position.city),
          state: str(position.state),
          postalCode: str(position.postalCode),
        }
      : null,
  };
}

export type McLeodOrderLike = Record<string, unknown>;

export function mapMcLeodOrder(
  order: McLeodOrderLike,
  options: { detailAvailable: boolean },
): { load: NormalizedEntity; deliveries: NormalizedEntity[] } {
  const orderId = str(order.orderId);
  if (!orderId) {
    throw new IntegrationError(
      "MAPPING_FAILURE",
      "McLeod order is missing a stable orderId.",
    );
  }

  const missingFields: string[] = [];
  const shipper = normalizeStop(order.shipperStop, "shipper");
  const consignee = normalizeStop(order.consigneeStop, "consignee");
  const intermediates = Array.isArray(order.intermediateStops)
    ? order.intermediateStops.map((stop) => normalizeStop(stop, "intermediate"))
    : [];

  if (!shipper) missingFields.push("shipperStop");
  if (!consignee) missingFields.push("consigneeStop");
  if (!Array.isArray(order.intermediateStops)) {
    missingFields.push("intermediateStops");
  }

  const progressUpdates = Array.isArray(order.progressUpdates)
    ? order.progressUpdates
        .map(normalizeProgressUpdate)
        .filter(
          (entry): entry is Record<string, unknown> => entry !== null,
        )
    : null;

  const loadData: Record<string, unknown> = {
    provider: "mcleod",
    product: "track-and-trace",
    orderId,
    status: str(order.status),
    consigneeReferenceNumber: str(order.consigneeReferenceNumber),
    shipmentId: str(order.shipmentId),
    billToCustomerCode: str(order.billToCustomerCode),
    linehaul: order.linehaul ?? null,
    pickup: shipper,
    stopCount:
      (shipper ? 1 : 0) +
      (consignee ? 1 : 0) +
      intermediates.filter(Boolean).length,
    detailAvailable: options.detailAvailable,
    missingFields,
  };

  if (options.detailAvailable) {
    loadData.charges = order.charges ?? null;
    loadData.progressUpdates = progressUpdates;
  } else {
    loadData.charges = null;
    loadData.progressUpdates = null;
  }

  const deliveries: NormalizedEntity[] = [];
  const deliveryStops: Array<{
    stop: Record<string, unknown> | null;
    role: "consignee" | "intermediate";
    fallbackIndex: number;
  }> = [
    { stop: consignee, role: "consignee", fallbackIndex: 0 },
    ...intermediates.map((stop, index) => ({
      stop,
      role: "intermediate" as const,
      fallbackIndex: index + 1,
    })),
  ];

  for (const { stop, role, fallbackIndex } of deliveryStops) {
    if (!stop) continue;
    const sequence = num(stop.sequenceNumber);
    const externalId =
      sequence !== null
        ? `${orderId}:stop:${sequence}`
        : `${orderId}:stop:${role}:${fallbackIndex}`;
    deliveries.push({
      kind: "DELIVERY",
      externalId,
      data: {
        provider: "mcleod",
        product: "track-and-trace",
        orderId,
        orderStatus: str(order.status),
        ...stop,
      },
    });
  }

  return {
    load: {
      kind: "LOAD",
      externalId: orderId,
      data: loadData,
    },
    deliveries,
  };
}

export function createMcLeodTrackAndTraceConnector(options?: {
  fetchImpl?: McLeodFetch;
}): IntegrationConnector {
  const descriptor: ConnectorDescriptor = {
    key: MCLEOD_TNT_PROVIDER_KEY,
    displayName: "McLeod LoadMaster Track & Trace",
    type: "TMS",
    description:
      "Read-only McLeod LoadMaster Track & Trace connector (sandbox). " +
      "Syncs active orders, stops, schedules, ETAs, and progress updates " +
      "into normalized TRUXERA external records.",
    auth: {
      kinds: ["API_KEY_BEARER"],
      requiresCredential: true,
    },
    capabilities: {
      entities: ["LOAD", "DELIVERY"],
      initialSync: true,
      incrementalSync: false,
      polling: true,
      webhooks: false,
    },
  };

  function clientFor(ctx: ConnectionContext): McLeodClient {
    const config = resolveConfig(ctx);
    const { apiKey, accessToken } = requireCredential(ctx.credential);
    return createMcLeodClient({
      baseUrl: config.baseUrl,
      tenantId: config.tenantId,
      apiKey,
      accessToken,
      fetchImpl: options?.fetchImpl,
    });
  }

  return {
    descriptor,

    async verifyConnection(ctx: ConnectionContext): Promise<ConnectionCheck> {
      try {
        const client = clientFor(ctx);
        const result = await client.get("/orders");
        assertMcLeodOk(result.status, "connection check");
        const orders = extractMcLeodOrderList(result.body);
        if (!orders) {
          return {
            ok: false,
            detail: "McLeod Track & Trace returned an unexpected response shape.",
          };
        }
        return {
          ok: true,
          detail: `Connected. ${orders.length} active order(s) visible to this tenant.`,
        };
      } catch (error) {
        return {
          ok: false,
          detail:
            error instanceof Error
              ? redactSecrets(error.message).slice(0, 300)
              : "Connection check failed.",
        };
      }
    },

    async fetchChanges(ctx: SyncContext): Promise<FetchResult> {
      const config = resolveConfig(ctx);
      const client = clientFor(ctx);
      const entities: NormalizedEntity[] = [];
      const seenOrders = new Set<string>();
      const seenCursors = new Set<string>();
      let orderCount = 0;
      let startItem: string | null = null;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const params = new URLSearchParams();
        if (config.orderStatus) params.set("status", config.orderStatus);
        if (startItem !== null) params.set("startItem", startItem);
        const query = params.toString();

        const listResult = await client.get(
          `/orders${query ? `?${query}` : ""}`,
          ctx.signal,
        );
        assertMcLeodOk(listResult.status, "orders list");
        const pageOrders = extractMcLeodOrderList(listResult.body);
        if (!pageOrders) {
          throw new IntegrationError(
            "INVALID_PAYLOAD",
            "McLeod Track & Trace orders list is not a recognized array shape.",
          );
        }

        for (const rawOrder of pageOrders) {
          const listRecord = asRecord(rawOrder);
          const orderId = listRecord ? str(listRecord.orderId) : null;
          if (!orderId) {
            throw new IntegrationError(
              "MAPPING_FAILURE",
              "McLeod orders list contains an order without an orderId.",
            );
          }
          if (seenOrders.has(orderId)) continue;
          seenOrders.add(orderId);
          orderCount += 1;
          if (orderCount > MAX_ORDERS_PER_SYNC) {
            throw new IntegrationError(
              "PROVIDER_ERROR",
              "McLeod Track & Trace order count exceeded the sync safety limit.",
            );
          }

          let orderData: McLeodOrderLike = listRecord as McLeodOrderLike;
          let detailAvailable = false;

          if (config.fetchOrderDetail) {
            const detailResult = await client.get(
              `/orders/${encodeURIComponent(orderId)}`,
              ctx.signal,
            );
            if (detailResult.status === 404) {
              detailAvailable = false;
            } else {
              assertMcLeodOk(detailResult.status, `order ${orderId} detail`);
              const detailRecord = asRecord(detailResult.body);
              if (!detailRecord || str(detailRecord.orderId) !== orderId) {
                throw new IntegrationError(
                  "INVALID_PAYLOAD",
                  `McLeod order detail for ${orderId} did not match the requested order.`,
                );
              }
              orderData = detailRecord as McLeodOrderLike;
              detailAvailable = true;
            }
          }

          const mapped = mapMcLeodOrder(orderData, { detailAvailable });
          entities.push(mapped.load, ...mapped.deliveries);
        }

        const nextItem = listResult.headers.get("x-mcld-next-item");
        if (
          !nextItem ||
          pageOrders.length === 0 ||
          seenCursors.has(nextItem) ||
          nextItem === startItem
        ) {
          break;
        }
        seenCursors.add(nextItem);
        startItem = nextItem;
      }

      if (entities.length === 0 && orderCount === 0) {
        // An empty active-order list is a valid state, not an error.
      }

      return { entities, nextCursor: null };
    },
  };
}

export const mcleodTrackAndTraceConnector =
  createMcLeodTrackAndTraceConnector();

export function isMcLeodOrderStatus(
  value: unknown,
): value is (typeof ORDER_STATUSES)[number] {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}
