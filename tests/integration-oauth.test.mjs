import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthorizationUrl,
  createOAuthState,
  exchangeAuthorizationCode,
  isOAuthCredentialExpiring,
  parseOAuthTokenResponse,
  refreshAccessToken,
  verifyOAuthState,
} from "../src/integrations/oauth.ts";
import {
  createSamsaraOAuthHandlers,
  getSamsaraOAuthConfig,
  isSamsaraOAuthConfigured,
} from "../src/integrations/connectors/samsara-oauth.ts";
import { IntegrationError } from "../src/integrations/errors.ts";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret";

const OAUTH_ENV = [
  "SAMSARA_OAUTH_CLIENT_ID",
  "SAMSARA_OAUTH_CLIENT_SECRET",
  "SAMSARA_OAUTH_AUTHORIZE_URL",
  "SAMSARA_OAUTH_TOKEN_URL",
  "SAMSARA_OAUTH_REVOKE_URL",
  "SAMSARA_OAUTH_SCOPES",
  "SAMSARA_OAUTH_REDIRECT_URI",
];

function clearSamsaraOAuthEnv() {
  for (const key of OAUTH_ENV) delete process.env[key];
}

function setSamsaraOAuthEnv() {
  clearSamsaraOAuthEnv();
  process.env.SAMSARA_OAUTH_CLIENT_ID = "client-id-test";
  process.env.SAMSARA_OAUTH_CLIENT_SECRET = "client-secret-test";
  process.env.SAMSARA_OAUTH_AUTHORIZE_URL = "https://auth.example.com/authorize";
  process.env.SAMSARA_OAUTH_TOKEN_URL = "https://auth.example.com/token";
}

test("oauth state: signed roundtrip, tamper and expiry rejected", () => {
  const { state, stateHash, expiresAt } = createOAuthState({
    integrationId: "int-1",
    organizationId: "org-1",
    providerKey: "samsara",
  });
  assert.ok(state.includes("."));
  assert.equal(stateHash.length, 64);

  const payload = verifyOAuthState(state);
  assert.ok(payload);
  assert.equal(payload.integrationId, "int-1");
  assert.equal(payload.organizationId, "org-1");
  assert.equal(payload.providerKey, "samsara");
  assert.ok(payload.expiresAt > Date.now());
  assert.ok(expiresAt instanceof Date);

  // Tampered payload rejected.
  const [encoded, signature] = state.split(".");
  const forged = Buffer.from(
    JSON.stringify({ ...payload, organizationId: "org-evil" }),
  ).toString("base64url");
  assert.equal(verifyOAuthState(`${forged}.${signature}`), null);
  assert.equal(verifyOAuthState(`${encoded}.badsignature`), null);
  assert.equal(verifyOAuthState("not-a-state"), null);

  // Expired state rejected.
  const expired = createOAuthState({
    integrationId: "int-1",
    organizationId: "org-1",
    providerKey: "samsara",
    now: new Date(Date.now() - 11 * 60 * 1000),
  });
  assert.equal(verifyOAuthState(expired.state), null);
});

test("buildAuthorizationUrl uses standard OAuth2 params only", () => {
  const url = new URL(
    buildAuthorizationUrl({
      authorizeUrl: "https://auth.example.com/authorize?existing=1",
      clientId: "cid",
      redirectUri: "https://app.example.com/api/integrations/oauth/samsara/callback",
      state: "state-123",
      scopes: ["read", "write"],
    }),
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example.com/api/integrations/oauth/samsara/callback");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("scope"), "read write");
  assert.equal(url.searchParams.get("existing"), "1");
  assert.throws(() =>
    buildAuthorizationUrl({
      authorizeUrl: "not a url",
      clientId: "c",
      redirectUri: "r",
      state: "s",
    }),
  );
});

test("parseOAuthTokenResponse extracts tokens and expiry", () => {
  const tokens = parseOAuthTokenResponse({
    access_token: "at-12345678",
    refresh_token: "rt-12345678",
    expires_in: 3600,
    token_type: "Bearer",
  });
  assert.equal(tokens.accessToken, "at-12345678");
  assert.equal(tokens.refreshToken, "rt-12345678");
  assert.ok(Date.parse(tokens.expiresAt) > Date.now());

  const minimal = parseOAuthTokenResponse({ access_token: "at-12345678" });
  assert.equal(minimal.refreshToken, undefined);
  assert.equal(minimal.expiresAt, undefined);

  assert.throws(() => parseOAuthTokenResponse({}), IntegrationError);
  assert.throws(() => parseOAuthTokenResponse({ access_token: "short" }), IntegrationError);
});

test("exchangeAuthorizationCode posts standard form and maps errors", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: "at-12345678", expires_in: 60 }),
    };
  };
  const tokens = await exchangeAuthorizationCode({
    tokenUrl: "https://auth.example.com/token",
    clientId: "cid",
    clientSecret: "csecret",
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
    fetchImpl,
  });
  assert.equal(tokens.accessToken, "at-12345678");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "auth-code");
  assert.equal(body.get("redirect_uri"), "https://app.example.com/callback");
  assert.equal(body.get("client_id"), "cid");

  const failing = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: "invalid_grant" }),
  });
  await assert.rejects(
    exchangeAuthorizationCode({
      tokenUrl: "https://auth.example.com/token",
      clientId: "cid",
      clientSecret: "csecret",
      code: "bad",
      redirectUri: "r",
      fetchImpl: failing,
    }),
    (e) => e instanceof IntegrationError && e.code === "AUTHENTICATION_FAILED",
  );
});

test("refreshAccessToken uses refresh_token grant", async () => {
  let seenBody = "";
  const fetchImpl = async (url, init) => {
    seenBody = init.body;
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: "at-new-12345678", refresh_token: "rt-new" }),
    };
  };
  const tokens = await refreshAccessToken({
    tokenUrl: "https://auth.example.com/token",
    clientId: "cid",
    clientSecret: "csecret",
    refreshToken: "rt-old",
    fetchImpl,
  });
  assert.equal(tokens.accessToken, "at-new-12345678");
  assert.equal(tokens.refreshToken, "rt-new");
  const body = new URLSearchParams(seenBody);
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), "rt-old");
});

test("isOAuthCredentialExpiring honors skew and missing expiry", () => {
  const soon = new Date(Date.now() + 30_000).toISOString();
  const later = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(isOAuthCredentialExpiring(soon), true);
  assert.equal(isOAuthCredentialExpiring(later), false);
  assert.equal(isOAuthCredentialExpiring(past), true);
  assert.equal(isOAuthCredentialExpiring(undefined), false);
  assert.equal(isOAuthCredentialExpiring("not-a-date"), false);
});

test("samsara oauth: unconfigured env fails closed", () => {
  clearSamsaraOAuthEnv();
  assert.equal(getSamsaraOAuthConfig(), null);
  assert.equal(isSamsaraOAuthConfigured(), false);
  const handlers = createSamsaraOAuthHandlers();
  assert.equal(handlers.isConfigured(), false);
  assert.throws(() => handlers.buildAuthorizationUrl({
    redirectUri: "https://app.example.com/cb",
    state: "s",
    ctx: { organizationId: "o", integrationId: "i", providerKey: "samsara", config: {} },
  }), IntegrationError);
});

test("samsara oauth: configured env builds url and exchanges code", async () => {
  setSamsaraOAuthEnv();
  process.env.SAMSARA_OAUTH_SCOPES = "read write";
  try {
    assert.equal(isSamsaraOAuthConfigured(), true);
    const config = getSamsaraOAuthConfig();
    assert.equal(config.clientId, "client-id-test");
    assert.deepEqual(config.scopes, ["read", "write"]);

    const handlers = createSamsaraOAuthHandlers({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "samsara-at-123456", refresh_token: "samsara-rt", expires_in: 7200 }),
      }),
    });
    assert.equal(handlers.isConfigured(), true);

    const authUrl = new URL(handlers.buildAuthorizationUrl({
      redirectUri: "https://staging.truxera.net/api/integrations/oauth/samsara/callback",
      state: "signed-state",
      ctx: { organizationId: "o", integrationId: "i", providerKey: "samsara", config: {} },
    }));
    assert.equal(authUrl.origin + authUrl.pathname, "https://auth.example.com/authorize");
    assert.equal(authUrl.searchParams.get("client_id"), "client-id-test");
    assert.equal(authUrl.searchParams.get("state"), "signed-state");
    assert.equal(authUrl.searchParams.get("scope"), "read write");

    const tokens = await handlers.exchangeCode({
      code: "code-1",
      redirectUri: "https://staging.truxera.net/api/integrations/oauth/samsara/callback",
      ctx: { organizationId: "o", integrationId: "i", providerKey: "samsara", config: {} },
    });
    assert.equal(tokens.accessToken, "samsara-at-123456");
    assert.equal(tokens.refreshToken, "samsara-rt");
    assert.ok(tokens.expiresAt);
  } finally {
    clearSamsaraOAuthEnv();
  }
});

test("samsara oauth: invalid authorize/token URLs are treated as unconfigured", () => {
  clearSamsaraOAuthEnv();
  process.env.SAMSARA_OAUTH_CLIENT_ID = "cid";
  process.env.SAMSARA_OAUTH_CLIENT_SECRET = "csecret";
  process.env.SAMSARA_OAUTH_AUTHORIZE_URL = "ftp://bad";
  process.env.SAMSARA_OAUTH_TOKEN_URL = "https://auth.example.com/token";
  try {
    assert.equal(getSamsaraOAuthConfig(), null);
  } finally {
    clearSamsaraOAuthEnv();
  }
});
