import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { isSandboxPaddleApiKey } from "../provider.ts";

/**
 * Paddle adapter — server-side only. The API key never leaves this
 * module: it is read from PADDLE_API_KEY, never logged, never sent to
 * the client, and never stored.
 *
 * SANDBOX ONLY: this adapter refuses anything that is not a
 * pdl_sdbx_apikey_ key, so a live key in the environment fails closed
 * instead of processing real payments.
 */

let client: Paddle | null | undefined;

export function getPaddleApiKey(): string | null {
  const key = process.env["PADDLE_API_KEY"]?.trim();
  return isSandboxPaddleApiKey(key) ? key! : null;
}

export function getPaddleClient(): Paddle | null {
  if (client !== undefined) return client;
  const key = getPaddleApiKey();
  client = key ? new Paddle(key, { environment: Environment.sandbox }) : null;
  return client;
}

/** Paddle notification-destination signing secret (pdl_ntfset_…). */
export function getPaddleWebhookSecret(): string | null {
  const secret = process.env["PADDLE_WEBHOOK_SECRET"]?.trim();
  return secret && secret.startsWith("pdl_ntfset_") ? secret : null;
}

export const PADDLE_PROVIDER_KEY = "paddle";
