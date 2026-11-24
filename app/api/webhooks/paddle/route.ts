import { NextResponse } from "next/server";
import { handlePaddleWebhook } from "@/src/billing/paddle/webhook";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("paddle-signature");
  const result = await handlePaddleWebhook(rawBody, signature);
  return NextResponse.json(result.body, { status: result.status });
}
