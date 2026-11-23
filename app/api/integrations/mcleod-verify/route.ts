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
// Read-only GET /orders only. Removed after verification.

const VERIFY_TOKEN = "f70fc5a2-8c40-4a20-8419-5a39bc8562f9";

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

  const baseUrl =
    process.env.MCLEOD_TNT_BASE_URL ||
    "https://api.mcleodsoftware.com/trackandtrace-sandbox";
  const tenantId = process.env.MCLEOD_TNT_TENANT || "2";

  const client = createMcLeodClient({ baseUrl, tenantId, apiKey, accessToken });
  const out: Record<string, unknown> = {};

  try {
    const probe = await client.get("/orders");
    out.ordersStatus = probe.status;
    out.ordersBody =
      probe.status >= 200 && probe.status < 300
        ? `ok type=${Array.isArray(probe.body) ? "array" : typeof probe.body} length=${Array.isArray(probe.body) ? probe.body.length : (probe.body as { items?: unknown[] })?.items?.length ?? "?"}`
        : redactSecrets(
            typeof probe.body === "string"
              ? probe.body
              : JSON.stringify(probe.body ?? null),
          ).slice(0, 300);
  } catch (error) {
    out.ordersError =
      error instanceof Error ? error.message.slice(0, 300) : "request failed";
    return NextResponse.json(out, { status: 502 });
  }

  const connector = createMcLeodTrackAndTraceConnector();
  const ctx: ConnectionContext = {
    organizationId: "sandbox-verify",
    integrationId: "sandbox-verify",
    providerKey: "mcleod-track-and-trace",
    config: { tenantId, baseUrl, fetchOrderDetail: false },
    credential: { kind: "API_KEY_BEARER" as const, apiKey, accessToken },
  };

  try {
    const check = await connector.verifyConnection!(ctx);
    out.verifyConnection = check;
    if (check.ok) {
      const sync = await connector.fetchChanges({
        ...(ctx as SyncContext),
        trigger: "MANUAL",
        cursor: null,
      });
      const loads = sync.entities.filter((e) => e.kind === "LOAD");
      const deliveries = sync.entities.filter((e) => e.kind === "DELIVERY");
      out.sync = {
        orderCount: loads.length,
        deliveryRecordCount: deliveries.length,
        orderStatuses: [...new Set(loads.map((e) => e.data.status))],
      };
    }
  } catch (error) {
    out.connectorError =
      error instanceof Error
        ? redactSecrets(error.message).slice(0, 300)
        : "sync failed";
  }

  return NextResponse.json(out);
}
