import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { IntegrationError, redactSecrets } from "./errors.ts";

/**
 * Provider-neutral OAuth 2.0 authorization-code helpers.
 *
 * These implement the standard OAuth2 flows only — provider-specific
 * endpoints, client credentials, scopes, and any provider quirks live in
 * each connector's OAuth adapter (e.g. connectors/samsara-oauth.ts) and are
 * supplied through environment configuration. Nothing here assumes a
 * particular provider's API contract.
 */

export type OAuthEndpoints = {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string | null;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  /** ISO timestamp when the access token expires, when the provider says so. */
  expiresAt?: string;
};

export type OAuthFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const defaultFetch: OAuthFetch = (url, init) =>
  fetch(url, init) as Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;

function oauthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new IntegrationError(
      "CREDENTIAL_UNAVAILABLE",
      "AUTH_SECRET is not configured; OAuth flows cannot be secured.",
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export function buildAuthorizationUrl(input: {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  let url: URL;
  try {
    url = new URL(input.authorizeUrl);
  } catch {
    throw new IntegrationError(
      "VALIDATION_FAILURE",
      "OAuth authorize URL is not a valid URL.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IntegrationError(
      "VALIDATION_FAILURE",
      "OAuth authorize URL must use http or https.",
    );
  }
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  const scopes = (input.scopes ?? [])
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (scopes.length > 0) {
    url.searchParams.set("scope", scopes.join(" "));
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Signed state (CSRF protection)
// ---------------------------------------------------------------------------

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStatePayload = {
  integrationId: string;
  organizationId: string;
  providerKey: string;
  nonce: string;
  expiresAt: number;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(payload).digest());
}

export function createOAuthState(input: {
  integrationId: string;
  organizationId: string;
  providerKey: string;
  now?: Date;
}): { state: string; stateHash: string; expiresAt: Date } {
  const payload: OAuthStatePayload = {
    integrationId: input.integrationId,
    organizationId: input.organizationId,
    providerKey: input.providerKey,
    nonce: randomBytes(16).toString("hex"),
    expiresAt: (input.now ?? new Date()).getTime() + OAUTH_STATE_TTL_MS,
  };
  const encoded = base64url(JSON.stringify(payload));
  const state = `${encoded}.${sign(encoded, oauthSecret())}`;
  return {
    state,
    stateHash: createHash("sha256").update(state).digest("hex"),
    expiresAt: new Date(payload.expiresAt),
  };
}

export function verifyOAuthState(
  state: string,
  now: Date = new Date(),
): OAuthStatePayload | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  const expected = sign(encoded, oauthSecret());
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    return null;
  }
  if (
    typeof payload.integrationId !== "string" ||
    typeof payload.organizationId !== "string" ||
    typeof payload.providerKey !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= now.getTime()
  ) {
    return null;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Token endpoint calls (standard OAuth2 form posts)
// ---------------------------------------------------------------------------

function tokenRequestBody(input: {
  grantType: "authorization_code" | "refresh_token";
  clientId: string;
  clientSecret: string;
  code?: string;
  redirectUri?: string;
  refreshToken?: string;
}): string {
  const params = new URLSearchParams({
    grant_type: input.grantType,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  if (input.code !== undefined) params.set("code", input.code);
  if (input.redirectUri !== undefined) params.set("redirect_uri", input.redirectUri);
  if (input.refreshToken !== undefined) {
    params.set("refresh_token", input.refreshToken);
  }
  return params.toString();
}

export function parseOAuthTokenResponse(body: unknown): OAuthTokens {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new IntegrationError(
      "INVALID_PAYLOAD",
      "OAuth token endpoint returned an invalid response.",
    );
  }
  const record = body as Record<string, unknown>;
  const accessToken = record["access_token"];
  if (typeof accessToken !== "string" || accessToken.length < 8) {
    throw new IntegrationError(
      "AUTHENTICATION_FAILED",
      "OAuth token endpoint did not return a usable access token.",
    );
  }
  const refreshToken = record["refresh_token"];
  const expiresIn = record["expires_in"];
  const tokens: OAuthTokens = { accessToken };
  if (typeof refreshToken === "string" && refreshToken.length > 0) {
    tokens.refreshToken = refreshToken;
  }
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
    tokens.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  return tokens;
}

async function postTokenRequest(input: {
  tokenUrl: string;
  body: string;
  what: string;
  fetchImpl?: OAuthFetch;
  signal?: AbortSignal;
}): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? defaultFetch;
  let response: Awaited<ReturnType<OAuthFetch>>;
  try {
    response = await fetchImpl(input.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: input.body,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (error) {
    throw new IntegrationError(
      "NETWORK_FAILURE",
      `OAuth ${input.what} request failed: ${redactSecrets(
        error instanceof Error ? error.message : "network error",
      ).slice(0, 200)}`,
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null
        ? String((body as Record<string, unknown>)["error"] ?? "")
        : "";
    throw new IntegrationError(
      response.status === 401 || response.status === 403
        ? "AUTHENTICATION_FAILED"
        : response.status === 429
          ? "RATE_LIMITED"
          : response.status >= 500
            ? "PROVIDER_UNAVAILABLE"
            : "PROVIDER_ERROR",
      `OAuth ${input.what} failed (${response.status})${detail ? `: ${redactSecrets(detail).slice(0, 120)}` : "."}`,
    );
  }
  return body;
}

export async function exchangeAuthorizationCode(input: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: OAuthFetch;
  signal?: AbortSignal;
}): Promise<OAuthTokens> {
  const body = await postTokenRequest({
    tokenUrl: input.tokenUrl,
    what: "code exchange",
    fetchImpl: input.fetchImpl,
    signal: input.signal,
    body: tokenRequestBody({
      grantType: "authorization_code",
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      code: input.code,
      redirectUri: input.redirectUri,
    }),
  });
  return parseOAuthTokenResponse(body);
}

export async function refreshAccessToken(input: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: OAuthFetch;
  signal?: AbortSignal;
}): Promise<OAuthTokens> {
  const body = await postTokenRequest({
    tokenUrl: input.tokenUrl,
    what: "token refresh",
    fetchImpl: input.fetchImpl,
    signal: input.signal,
    body: tokenRequestBody({
      grantType: "refresh_token",
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken: input.refreshToken,
    }),
  });
  return parseOAuthTokenResponse(body);
}

// ---------------------------------------------------------------------------
// Expiry helpers
// ---------------------------------------------------------------------------

/** True when an OAuth credential is expired or within `skewMs` of expiry. */
export function isOAuthCredentialExpiring(
  expiresAt: string | undefined,
  now: Date = new Date(),
  skewMs = 60_000,
): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return false;
  return time - now.getTime() <= skewMs;
}
