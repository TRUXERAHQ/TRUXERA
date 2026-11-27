import { IntegrationError, redactSecrets } from "../errors.ts";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  type OAuthFetch,
  type OAuthTokens,
} from "../oauth.ts";
import type { OAuthConnectorHandlers } from "../connector.ts";

/**
 * Samsara OAuth 2.0 adapter.
 *
 * Samsara's partner OAuth endpoints, client credentials, scopes, and token
 * lifetimes are NOT known until Samsara issues developer/partner access.
 * This adapter therefore reads every provider-specific value from the
 * environment and fails closed (`isConfigured() === false`) when they are
 * absent. No Samsara OAuth URL, scope, or credential is invented here.
 *
 * Required environment (all optional until Samsara provides them):
 *   SAMSARA_OAUTH_CLIENT_ID       — OAuth app client id
 *   SAMSARA_OAUTH_CLIENT_SECRET   — OAuth app client secret
 *   SAMSARA_OAUTH_AUTHORIZE_URL   — provider authorization endpoint
 *   SAMSARA_OAUTH_TOKEN_URL       — provider token endpoint
 * Optional:
 *   SAMSARA_OAUTH_REVOKE_URL      — provider revocation endpoint
 *   SAMSARA_OAUTH_SCOPES          — space-separated scope list
 *   SAMSARA_OAUTH_REDIRECT_URI    — override for the callback URL
 *                                   (otherwise derived from the request host)
 */

const ENV = {
  clientId: "SAMSARA_OAUTH_CLIENT_ID",
  clientSecret: "SAMSARA_OAUTH_CLIENT_SECRET",
  authorizeUrl: "SAMSARA_OAUTH_AUTHORIZE_URL",
  tokenUrl: "SAMSARA_OAUTH_TOKEN_URL",
  revokeUrl: "SAMSARA_OAUTH_REVOKE_URL",
  scopes: "SAMSARA_OAUTH_SCOPES",
  redirectUri: "SAMSARA_OAUTH_REDIRECT_URI",
} as const;

export type SamsaraOAuthConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
  scopes: string[];
  redirectUri: string | null;
};

function envValue(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? value
      : null;
  } catch {
    return null;
  }
}

/**
 * Returns the Samsara OAuth configuration, or null when any required
 * provider value is missing/invalid. Never throws for missing config —
 * callers use this to render an honest "not configured" state.
 */
export function getSamsaraOAuthConfig(): SamsaraOAuthConfig | null {
  const clientId = envValue(ENV.clientId);
  const clientSecret = envValue(ENV.clientSecret);
  const authorizeUrl = validHttpUrl(envValue(ENV.authorizeUrl));
  const tokenUrl = validHttpUrl(envValue(ENV.tokenUrl));
  if (!clientId || !clientSecret || !authorizeUrl || !tokenUrl) {
    return null;
  }
  const scopes = (envValue(ENV.scopes) ?? "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return {
    clientId,
    clientSecret,
    authorizeUrl,
    tokenUrl,
    revokeUrl: validHttpUrl(envValue(ENV.revokeUrl)),
    scopes,
    redirectUri: validHttpUrl(envValue(ENV.redirectUri)),
  };
}

export function isSamsaraOAuthConfigured(): boolean {
  return getSamsaraOAuthConfig() !== null;
}

function requireConfig(): SamsaraOAuthConfig {
  const config = getSamsaraOAuthConfig();
  if (!config) {
    throw new IntegrationError(
      "CREDENTIAL_UNAVAILABLE",
      "Samsara OAuth is not configured. Set the SAMSARA_OAUTH_* environment variables once Samsara issues developer credentials.",
    );
  }
  return config;
}

function resolveRedirectUri(
  config: SamsaraOAuthConfig,
  redirectUri: string,
): string {
  // An explicit env override wins (some providers require pre-registration);
  // otherwise the request-derived callback URL is used.
  return config.redirectUri ?? redirectUri;
}

async function tokenCall(
  fn: () => Promise<OAuthTokens>,
  what: string,
): Promise<OAuthTokens> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError(
      "PROVIDER_ERROR",
      `Samsara OAuth ${what} failed: ${redactSecrets(
        error instanceof Error ? error.message : "unknown error",
      ).slice(0, 200)}`,
    );
  }
}

export function createSamsaraOAuthHandlers(options?: {
  fetchImpl?: OAuthFetch;
}): OAuthConnectorHandlers {
  const fetchImpl = options?.fetchImpl;

  const handlers: OAuthConnectorHandlers = {
    isConfigured() {
      return isSamsaraOAuthConfigured();
    },

    buildAuthorizationUrl({ redirectUri, state }) {
      const config = requireConfig();
      return buildAuthorizationUrl({
        authorizeUrl: config.authorizeUrl,
        clientId: config.clientId,
        redirectUri: resolveRedirectUri(config, redirectUri),
        state,
        scopes: config.scopes,
      });
    },

    exchangeCode({ code, redirectUri }) {
      const config = requireConfig();
      return tokenCall(
        () =>
          exchangeAuthorizationCode({
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            code,
            redirectUri: resolveRedirectUri(config, redirectUri),
            fetchImpl,
          }),
        "code exchange",
      );
    },

    refreshToken({ refreshToken }) {
      const config = requireConfig();
      return tokenCall(
        () =>
          refreshAccessToken({
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            refreshToken,
            fetchImpl,
          }),
        "token refresh",
      );
    },
  };

  // Provider-side revocation is only wired when Samsara documents an
  // endpoint; until then local credential revocation is the boundary.
  const revokeUrl = getSamsaraOAuthConfig()?.revokeUrl ?? null;
  if (revokeUrl) {
    handlers.revokeToken = async ({ token }) => {
      const fetcher = fetchImpl ?? ((url, init) => fetch(url, init));
      try {
        await fetcher(revokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }).toString(),
        });
      } catch {
        // Best-effort only — local revocation already happened.
      }
    };
  }

  return handlers;
}
