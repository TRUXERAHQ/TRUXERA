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
// Read-only: runs verifyConnection + one orders-list fetch against the
// Track & Trace sandbox. Removed after verification. Never returns
// credential values or raw provider payloads.

const VERIFY_TOKEN = "f70fc5a2-8c40-4a20-8419-5a39bc8562f9";

function safeBody(body: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? null);
  return redactSecrets(text).slice(0, 400);
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

  const baseUrl =
    process.env.MCLEOD_TNT_BASE_URL ||
    "https://api.mcleodsoftware.com/trackandtrace-sandbox";
  const tenantId = process.env.MCLEOD_TNT_TENANT || "2";

  const diagnostics: Record<string, unknown> = {
    baseUrl,
    tenantId,
    apiKeyLen: apiKey.length,
    tokenLen: accessToken.length,
  };

  const client = createMcLeodClient({
    baseUrl,
    tenantId,
    apiKey,
    accessToken,
  });

  try {
    const probe = await client.get("/orders");
    diagnostics.listStatus = probe.status;
    diagnostics.listBodyPreview =
      probe.status >= 200 && probe.status < 300
        ? `array=${Array.isArray(probe.body)} length=${Array.isArray(probe.body) ? probe.body.length : "n/a"}`
        : safeBody(probe.body);
  } catch (error) {
    diagnostics.listError =
      error instanceof Error ? error.message.slice(0, 300) : "request failed";
    return NextResponse.json(diagnostics, { status: 502 });
  }

  const connector = createMcLeodTrackAndTraceConnector();
  const ctx: ConnectionContext = {
    organizationId: "sandbox-verify",
    integrationId: "sandbox-verify",
    providerKey: "mcleod-track-and-trace",
    config: {
      tenantId,
      baseUrl,
      fetchOrderDetail: false,
    },
    credential: { kind: "API_KEY_BEARER" as const, apiKey, accessToken },
  };

  try {
    const check = await connector.verifyConnection!(ctx);
    diagnostics.verifyConnection = check;
    if (!check.ok) {
      return NextResponse.json(diagnostics, { status: 502 });
    }

    const result = await connector.fetchChanges({
      ...(ctx as SyncContext),
      trigger: "MANUAL",
      cursor: null,
    });

    const loads = result.entities.filter((e) => e.kind === "LOAD");
    const deliveries = result.entities.filter((e) => e.kind === "DELIVERY");
    const statuses = [...new Set(loads.map((e) => e.data.status))];
    const missingFieldCounts = loads.reduce<Record<string, number>>(
      (acc, e) => {
        const missing = Array.isArray(e.data.missingFields)
          ? (e.data.missingFields as string[])
          : [];
        for (const field of missing) acc[field] = (acc[field] ?? 0) + 1;
        return acc;
      },
      {},
    );

    return NextResponse.json({
      ...diagnostics,
      orderCount: loads.length,
      deliveryRecordCount: deliveries.length,
      orderStatuses: statuses,
      missingFieldCounts,
      detailFetched: false,
      note: "List-level mapping verified; order-detail endpoint not called in this check.",
    });
  } catch (error) {
    diagnostics.syncError =
      error instanceof Error
        ? redactSecrets(error.message).slice(0, 300)
        : "sync failed";
    return NextResponse.json(diagnostics, { status: 502 });
  }
}
