import type {
  ConnectionCheck,
  ConnectionContext,
  ConnectorDescriptor,
  FetchResult,
  IntegrationConnector,
  SyncContext,
} from "../connector.ts";
import type { ConnectorSignal } from "../connector.ts";
import type { IntegrationCredentialPayload } from "../auth.ts";
import { IntegrationError, redactSecrets } from "../errors.ts";
import {
  extractSamsaraHosSignals,
  extractSamsaraStatsSignals,
  mapSamsaraDriver,
  mapSamsaraVehicle,
  parseSamsaraPage,
  type SamsaraPage,
} from "./samsara-normalize.ts";
import type { NormalizedEntity } from "../normalize.ts";

export const SAMSARA_PROVIDER_KEY = "samsara";
export const SAMSARA_DEFAULT_BASE_URL = "https://api.samsara.com";
export const SAMSARA_EXPECTED_SYNC_INTERVAL_MINUTES = 30;

const DEFAULT_STATS_TYPES = "gps,engineStates";
const MAX_ENTITY_PAGES = 20;
const MAX_FEED_PAGES = 50;
const MAX_SIGNALS_PER_SYNC = 20000;

export type SamsaraFetchResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type SamsaraFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<SamsaraFetchResponse>;

export type SamsaraClient = {
  get(
    path: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{ status: number; headers: { get(name: string): string | null }; body: unknown }>;
};

export function createSamsaraClient(input: {
  baseUrl: string;
  apiToken: string;
  fetchImpl?: SamsaraFetch;
}): SamsaraClient {
  const fetchImpl: SamsaraFetch =
    input.fetchImpl ??
    ((url, init) => fetch(url, init) as Promise<SamsaraFetchResponse>);
  const baseUrl = input.baseUrl.replace(/\/+$/, "");

  return {
    async get(path, params, signal) {
      const query = params ? `?${new URLSearchParams(params)}` : "";
      let response: SamsaraFetchResponse;
      try {
        response = await fetchImpl(`${baseUrl}${path}${query}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${input.apiToken}`,
          },
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        throw new IntegrationError(
          "NETWORK_FAILURE",
          `Samsara request failed: ${redactSecrets(
            error instanceof Error ? error.message : "network error",
          ).slice(0, 200)}`,
        );
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        throw new IntegrationError(
          "INVALID_PAYLOAD",
          "Samsara returned a non-JSON response.",
        );
      }

      return { status: response.status, headers: response.headers, body };
    },
  };
}

export function assertSamsaraOk(
  status: number,
  what: string,
  retryAfterSeconds?: number | null,
): void {
  if (status >= 200 && status < 300) return;
  if (status === 401) {
    throw new IntegrationError(
      "AUTHENTICATION_FAILED",
      `Samsara rejected credentials for ${what} (401). Check the API token and its scopes.`,
    );
  }
  if (status === 403) {
    throw new IntegrationError(
      "AUTHORIZATION_FAILED",
      `Samsara denied access for ${what} (403). The API token lacks the required read scope.`,
    );
  }
  if (status === 404) {
    throw new IntegrationError(
      "PROVIDER_ERROR",
      `Samsara endpoint for ${what} was not found (404).`,
    );
  }
  if (status === 429) {
    const wait =
      retryAfterSeconds && retryAfterSeconds > 0
        ? ` Retry after ${retryAfterSeconds}s.`
        : " Retry after the provider's Retry-After window.";
    throw new IntegrationError(
      "RATE_LIMITED",
      `Samsara rate limited ${what} (429).${wait}`,
    );
  }
  if (status >= 500) {
    throw new IntegrationError(
      "PROVIDER_UNAVAILABLE",
      `Samsara is unavailable for ${what} (${status}).`,
    );
  }
  throw new IntegrationError(
    "PROVIDER_ERROR",
    `Samsara request for ${what} failed with status ${status}.`,
  );
}

type SamsaraCursorState = { stats?: string | null };

function retryAfterSeconds(headers: {
  get(name: string): string | null;
}): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function parseCursor(raw: string | null): SamsaraCursorState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return {
      stats: typeof parsed["stats"] === "string" ? parsed["stats"] : null,
    };
  } catch {
    // An unreadable cursor is reset rather than bricking the integration;
    // feed replays are idempotent through signal/record dedupe.
    return {};
  }
}

function requireApiToken(
  credential: IntegrationCredentialPayload | null,
): string {
  if (!credential || credential.kind !== "API_KEY_BEARER") {
    throw new IntegrationError(
      "CREDENTIAL_UNAVAILABLE",
      "Samsara requires an API key + bearer token credential.",
    );
  }
  return credential.accessToken;
}

function resolveConfig(ctx: ConnectionContext): {
  baseUrl: string;
  statsTypes: string;
  includeHos: boolean;
} {
  const config = ctx.config ?? {};
  const rawBaseUrl =
    typeof config.baseUrl === "string" && config.baseUrl.trim()
      ? config.baseUrl.trim()
      : SAMSARA_DEFAULT_BASE_URL;
  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("bad protocol");
    }
  } catch {
    throw new IntegrationError(
      "VALIDATION_FAILURE",
      "Samsara base URL is not a valid URL.",
    );
  }
  const statsTypes =
    typeof config.statsTypes === "string" && config.statsTypes.trim()
      ? config.statsTypes.trim()
      : DEFAULT_STATS_TYPES;
  return {
    baseUrl: rawBaseUrl.replace(/\/+$/, ""),
    statsTypes,
    includeHos: config.includeHos !== false,
  };
}

async function listAllPages(input: {
  client: SamsaraClient;
  path: string;
  params?: Record<string, string>;
  what: string;
  signal?: AbortSignal;
}): Promise<SamsaraPage["entries"]> {
  const all: unknown[] = [];
  let after: string | null = null;
  const seenCursors = new Set<string>();

  for (let page = 0; page < MAX_ENTITY_PAGES; page += 1) {
    const params: Record<string, string> = {
      limit: "512",
      ...(input.params ?? {}),
      ...(after ? { after } : {}),
    };
    const result = await input.client.get(input.path, params, input.signal);
    assertSamsaraOk(
      result.status,
      input.what,
      retryAfterSeconds(result.headers),
    );
    const parsed = parseSamsaraPage(result.body, input.what);
    all.push(...parsed.entries);
    if (!parsed.hasNextPage || !parsed.endCursor || seenCursors.has(parsed.endCursor)) {
      break;
    }
    seenCursors.add(parsed.endCursor);
    after = parsed.endCursor;
  }
  return all;
}

async function drainFeed(input: {
  client: SamsaraClient;
  path: string;
  params: Record<string, string>;
  what: string;
  startCursor: string | null;
  signal?: AbortSignal;
}): Promise<{ entries: unknown[]; endCursor: string | null }> {
  const entries: unknown[] = [];
  let after = input.startCursor;
  let endCursor = input.startCursor;
  const seenCursors = new Set<string>();

  for (let page = 0; page < MAX_FEED_PAGES; page += 1) {
    const result = await input.client.get(
      input.path,
      {
        ...input.params,
        ...(after ? { after } : {}),
      },
      input.signal,
    );
    assertSamsaraOk(
      result.status,
      input.what,
      retryAfterSeconds(result.headers),
    );
    const parsed = parseSamsaraPage(result.body, input.what);
    entries.push(...parsed.entries);

    if (entries.length > MAX_SIGNALS_PER_SYNC * 4) {
      throw new IntegrationError(
        "PROVIDER_ERROR",
        `Samsara ${input.what} feed exceeded the sync safety limit.`,
      );
    }

    if (!parsed.hasNextPage || !parsed.endCursor) {
      endCursor = parsed.endCursor ?? after;
      break;
    }
    if (seenCursors.has(parsed.endCursor)) {
      // Repeated cursor: stop rather than loop forever; the last cursor is
      // still safe because entries were already collected.
      endCursor = parsed.endCursor;
      break;
    }
    seenCursors.add(parsed.endCursor);
    after = parsed.endCursor;
    endCursor = parsed.endCursor;
  }
  return { entries, endCursor };
}

export function createSamsaraConnector(options?: {
  fetchImpl?: SamsaraFetch;
}): IntegrationConnector {
  const descriptor: ConnectorDescriptor = {
    key: SAMSARA_PROVIDER_KEY,
    displayName: "Samsara",
    type: "GPS_TELEMATICS",
    description:
      "Samsara fleet telematics connector. Syncs vehicles and drivers as " +
      "linked fleet entities and vehicle stats / HOS clocks as operational " +
      "signals (location, motion state, driver duty status).",
    auth: {
      kinds: ["API_KEY_BEARER"],
      requiresCredential: true,
    },
    capabilities: {
      entities: ["TRUCK", "DRIVER"],
      initialSync: true,
      incrementalSync: true,
      polling: true,
      webhooks: false,
    },
  };

  function clientFor(ctx: ConnectionContext): SamsaraClient {
    const config = resolveConfig(ctx);
    const apiToken = requireApiToken(ctx.credential);
    return createSamsaraClient({
      baseUrl: config.baseUrl,
      apiToken,
      fetchImpl: options?.fetchImpl,
    });
  }

  return {
    descriptor,

    async verifyConnection(ctx: ConnectionContext): Promise<ConnectionCheck> {
      try {
        const client = clientFor(ctx);
        const result = await client.get("/fleet/vehicles", { limit: "1" });
        assertSamsaraOk(result.status, "connection check");
        return {
          ok: true,
          detail: "Connected to Samsara. Vehicle read access verified.",
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
      const signals: ConnectorSignal[] = [];
      const cursorState = parseCursor(ctx.cursor);

      // Fleet entity snapshots (checksum-idempotent upserts downstream).
      // A malformed record is skipped rather than failing the whole sync.
      const mapSafe = (raw: unknown, map: (v: unknown) => NormalizedEntity) => {
        try {
          entities.push(map(raw));
        } catch {
          // Invalid provider record: dropped, never partially persisted.
        }
      };
      const vehicles = await listAllPages({
        client,
        path: "/fleet/vehicles",
        what: "vehicles",
        signal: ctx.signal,
      });
      for (const raw of vehicles) mapSafe(raw, mapSamsaraVehicle);

      const drivers = await listAllPages({
        client,
        path: "/fleet/drivers",
        what: "drivers",
        signal: ctx.signal,
      });
      for (const raw of drivers) mapSafe(raw, mapSamsaraDriver);

      // Incremental vehicle stats feed → location/motion signals.
      const statsFeed = await drainFeed({
        client,
        path: "/fleet/vehicles/stats/feed",
        params: { types: config.statsTypes },
        what: "vehicle stats",
        startCursor: cursorState.stats ?? null,
        signal: ctx.signal,
      });
      signals.push(...extractSamsaraStatsSignals(statsFeed.entries));

      // HOS clocks is a paginated current-state snapshot (not a cursor
      // feed), so every sync drains all pages and no cursor is persisted.
      // Requires the "Read ELD Compliance Settings (US)" token scope.
      if (config.includeHos) {
        const hosEntries = await listAllPages({
          client,
          path: "/fleet/hos/clocks",
          what: "HOS clocks",
          signal: ctx.signal,
        });
        const observedAt = new Date().toISOString();
        signals.push(...extractSamsaraHosSignals(hosEntries, observedAt));
      }

      if (signals.length > MAX_SIGNALS_PER_SYNC) {
        throw new IntegrationError(
          "PROVIDER_ERROR",
          "Samsara signal count exceeded the sync safety limit.",
        );
      }

      const nextCursor = JSON.stringify({
        stats: statsFeed.endCursor ?? cursorState.stats ?? null,
      });

      return { entities, signals, nextCursor };
    },
  };
}

export const samsaraConnector = createSamsaraConnector();
