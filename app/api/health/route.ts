import { NextResponse } from "next/server";
import { connectDatabase, db } from "@/src/prisma/db";
import { computeApplicationHealth } from "@/src/reliability/reliability";
import { redactSecrets } from "@/src/integrations/errors";

function logProbeFailure(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");
  console.error(`[health] database probe failed: ${redactSecrets(message).slice(0, 300)}`);
}

/**
 * Minimal liveness/readiness probe. Unauthenticated by design — returns
 * only coarse status, never internals, credentials, or stack details.
 * The database check is a single primary-key lookup.
 */
export async function GET() {
  let databaseReachable = false;
  try {
    await connectDatabase();
    await db.orm.public.Organization.where({}).first();
    databaseReachable = true;
  } catch (error) {
    databaseReachable = false;
    logProbeFailure(error);
  }

  const health = computeApplicationHealth({ databaseReachable });
  return NextResponse.json(health, {
    status: health.status === "UNAVAILABLE" ? 503 : 200,
  });
}
