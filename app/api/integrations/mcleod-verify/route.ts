import { NextResponse } from "next/server";
import { createMcLeodTrackAndTraceConnector } from "@/src/integrations/connectors/mcleod-track-and-trace";
import type {
  ConnectionContext,
  SyncContext,
} from "@/src/integrations/connector";

// TEMPORARY staging-only McLeod sandbox verification endpoint.
// Read-only: runs verifyConnection + one orders-list fetch against the
// Track & Trace sandbox. Removed after verification. Never returns
// credential values or raw provider payloads.

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

  const connector = createMcLeodTrackAndTraceConnector();
  const ctx: ConnectionContext = {
    organizationId: "sandbox-verify",
    integrationId: "sandbox-verify",
    providerKey: "mcleod-track-and-trace",
    config: {
      tenantId: process.env.MCLEOD_TNT_TENANT || "2",
      fetchOrderDetail: false,
    },
    credential: { kind: "API_KEY_BEARER" as const, apiKey, accessToken },
  };

  try {
    const check = await connector.verifyConnection!(ctx);
    if (!check.ok) {
      return NextResponse.json({ verifyConnection: check }, { status: 502 });
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
      verifyConnection: check,
      ordersListHttp: "200",
      orderCount: loads.length,
      deliveryRecordCount: deliveries.length,
      orderStatuses: statuses,
      missingFieldCounts,
      detailFetched: false,
      note: "List-level mapping verified; order-detail endpoint not called in this check.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message.replace(/bearer\s+\S+/gi, "[redacted]").slice(0, 300)
            : "Verification failed.",
      },
      { status: 502 },
    );
  }
}
