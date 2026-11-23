import { NextResponse } from "next/server";
import {
  createMcLeodClient,
  createMcLeodTrackAndTraceConnector,
} from "@/src/integrations/connectors/mcleod-track-and-trace";
import { redactSecrets } from "@/src/integrations/errors";
import type {
  ConnectionContext,
  SyncContext,
} from "@/src/integrations/connector";

// TEMPORARY staging-only McLeod sandbox verification endpoint.
// Read-only GET probes only. Removed after verification.

const VERIFY_TOKEN = "f70fc5a2-8c40-4a20-8419-5a39bc8562f9";

function safeBody(body: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? null);
  return redactSecrets(text).slice(0, 300);
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  if (request.headers.get("x-mcleod-verify") !== VERIFY_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.MCLEOD_TNT_API_KEY;
  const accessToken = process.env.MCLEOD_TNT_ACCESS_TOKEN;
  if (!apiKey || !accessToken) {
    return NextResponse.json(
      { error: "McLeod sandbox credentials are not configured." },
      { status: 503 },
    );
  }

  const diagnostics: Record<string, unknown> = {};
  try {
    const parts = accessToken.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      ) as { exp?: number; iat?: number };
      diagnostics.token = {
        jwt: true,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        expired: payload.exp ? payload.exp * 1000 < Date.now() : null,
      };
    } else {
      diagnostics.token = { jwt: false, length: accessToken.length };
    }
  } catch {
    diagnostics.token = { jwt: false, length: accessToken.length };
  }

  const host = "https://api.mcleodsoftware.com";
  const tenantId = process.env.MCLEOD_TNT_TENANT || "2";
  const client = createMcLeodClient({
    baseUrl: host,
    tenantId,
    apiKey,
    accessToken,
  });

  const probes: Array<[string, string]> = [
    ["tt-sandbox /orders", "/trackandtrace-sandbox/orders"],
    ["tt-live-path /orders", "/trackandtrace/orders"],
    ["tt-live-path /orders/", "/trackandtrace/orders/"],
    ["tt-sandbox /trackandtrace/orders", "/trackandtrace-sandbox/trackandtrace/orders"],
  ];

  const results: Record<string, unknown> = { diagnostics };
  for (const [label, path] of probes) {
    try {
      const res = await client.get(path);
      results[label] = {
        status: res.status,
        body:
          res.status >= 200 && res.status < 300
            ? `ok array=${Array.isArray(res.body)} items=${Array.isArray(res.body) ? res.body.length : (res.body as {items?:unknown[]})?.items?.length ?? "?"} keys=${res.body && typeof res.body === "object" ? Object.keys(res.body as object).join(",") : typeof res.body}`
            : safeBody(res.body),
      };
      if (res.status >= 200 && res.status < 300) break;
    } catch (error) {
      results[label] = {
        error: error instanceof Error ? error.message.slice(0, 200) : "failed",
      };
    }
  }

  // If any probe succeeded, run the real connector verification + list sync.
  const anyOk = Object.values(results).some(
    (r) => typeof r === "object" && r !== null && (r as {status?:number}).status !== undefined && (r as {status:number}).status >= 200 && (r as {status:number}).status < 300,
  );

  if (anyOk) {
    const connector = createMcLeodTrackAndTraceConnector();
    const ctx: ConnectionContext = {
      organizationId: "sandbox-verify",
      integrationId: "sandbox-verify",
      providerKey: "mcleod-track-and-trace",
      config: {
        tenantId,
        baseUrl: `${host}/trackandtrace-sandbox`,
        fetchOrderDetail: false,
      },
      credential: { kind: "API_KEY_BEARER" as const, apiKey, accessToken },
    };
    try {
      const check = await connector.verifyConnection!(ctx);
      results.verifyConnection = check;
      if (check.ok) {
        const sync = await connector.fetchChanges({
          ...(ctx as SyncContext),
          trigger: "MANUAL",
          cursor: null,
        });
        const loads = sync.entities.filter((e) => e.kind === "LOAD");
        const deliveries = sync.entities.filter((e) => e.kind === "DELIVERY");
        results.sync = {
          orderCount: loads.length,
          deliveryRecordCount: deliveries.length,
          orderStatuses: [...new Set(loads.map((e) => e.data.status))],
          missingFieldCounts: loads.reduce<Record<string, number>>((acc, e) => {
            for (const f of (Array.isArray(e.data.missingFields) ? e.data.missingFields : []) as string[]) {
              acc[f] = (acc[f] ?? 0) + 1;
            }
            return acc;
          }, {}),
        };
      }
    } catch (error) {
      results.connectorError =
        error instanceof Error ? redactSecrets(error.message).slice(0, 300) : "failed";
    }
  }

  return NextResponse.json(results);
}
