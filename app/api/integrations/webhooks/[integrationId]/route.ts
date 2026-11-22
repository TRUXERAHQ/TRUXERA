import { NextResponse } from "next/server";
import { isUuid } from "@/src/trucks/truck-policy";
import { ingestWebhookForIntegration } from "@/src/prisma/integration-data";

function headerMap(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await context.params;
  if (!isUuid(integrationId)) {
    return NextResponse.json({ error: "Unknown integration." }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Webhook payload must be valid JSON." },
      { status: 400 },
    );
  }

  const result = await ingestWebhookForIntegration({
    integrationId,
    rawBody,
    headers: headerMap(request.headers),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(
    { received: true, duplicate: result.duplicate, status: result.status },
    { status: result.duplicate ? 200 : 202 },
  );
}
