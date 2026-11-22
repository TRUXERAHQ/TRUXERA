import {
  INTEGRATION_AUTH_KINDS,
  type IntegrationAuthKind,
} from "./types.ts";
import { IntegrationError } from "./errors.ts";

export type IntegrationCredentialPayload =
  | { kind: "API_KEY"; apiKey: string; keyName?: string }
  | {
      kind: "API_KEY_BEARER";
      apiKey: string;
      accessToken: string;
      expiresAt?: string;
    }
  | { kind: "OAUTH2"; accessToken: string; refreshToken?: string; expiresAt?: string }
  | { kind: "BEARER_TOKEN"; token: string }
  | { kind: "BASIC"; username: string; password: string };

export type CredentialMetadata = {
  kind: IntegrationAuthKind;
  hint: string | null;
  expiresAt: Date | null;
};

const SECRET_FIELD = {
  API_KEY: "apiKey",
  API_KEY_BEARER: "accessToken",
  OAUTH2: "accessToken",
  BEARER_TOKEN: "token",
  BASIC: "password",
} as const;

function secretOf(payload: IntegrationCredentialPayload): string {
  const field = SECRET_FIELD[payload.kind];
  return (payload as Record<string, string>)[field] ?? "";
}

export function credentialHint(payload: IntegrationCredentialPayload): string | null {
  const secret = secretOf(payload);
  if (secret.length < 4) return null;
  return `…${secret.slice(-4)}`;
}

export function credentialExpiresAt(
  payload: IntegrationCredentialPayload,
): Date | null {
  if (
    (payload.kind !== "OAUTH2" && payload.kind !== "API_KEY_BEARER") ||
    !payload.expiresAt
  ) {
    return null;
  }
  const parsed = new Date(payload.expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function credentialMetadata(
  payload: IntegrationCredentialPayload,
): CredentialMetadata {
  return {
    kind: payload.kind,
    hint: credentialHint(payload),
    expiresAt: credentialExpiresAt(payload),
  };
}

export function parseIntegrationCredentialInput(values: {
  authKind?: unknown;
  apiKey?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
  token?: unknown;
  username?: unknown;
  password?: unknown;
  expiresAt?: unknown;
  keyName?: unknown;
}): { ok: true; credential: IntegrationCredentialPayload } | { ok: false; error: string } {
  const kind = typeof values.authKind === "string" ? values.authKind : "";
  if (!INTEGRATION_AUTH_KINDS.includes(kind as IntegrationAuthKind)) {
    return { ok: false, error: "Select a supported authentication method." };
  }

  const str = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";

  switch (kind as IntegrationAuthKind) {
    case "API_KEY": {
      const apiKey = str(values.apiKey);
      if (apiKey.length < 8 || apiKey.length > 512) {
        return { ok: false, error: "Enter a valid API key." };
      }
      const keyName = str(values.keyName);
      return {
        ok: true,
        credential: {
          kind: "API_KEY",
          apiKey,
          ...(keyName ? { keyName } : {}),
        },
      };
    }
    case "API_KEY_BEARER": {
      const apiKey = str(values.apiKey);
      const accessToken = str(values.accessToken);
      if (apiKey.length < 8 || apiKey.length > 512) {
        return { ok: false, error: "Enter a valid API key." };
      }
      if (accessToken.length < 8 || accessToken.length > 8192) {
        return { ok: false, error: "Enter a valid bearer access token." };
      }
      const expiresAt = str(values.expiresAt);
      return {
        ok: true,
        credential: {
          kind: "API_KEY_BEARER",
          apiKey,
          accessToken,
          ...(expiresAt ? { expiresAt } : {}),
        },
      };
    }
    case "OAUTH2": {
      const accessToken = str(values.accessToken);
      if (accessToken.length < 8 || accessToken.length > 8192) {
        return { ok: false, error: "Enter a valid OAuth access token." };
      }
      const refreshToken = str(values.refreshToken);
      const expiresAt = str(values.expiresAt);
      return {
        ok: true,
        credential: {
          kind: "OAUTH2",
          accessToken,
          ...(refreshToken ? { refreshToken } : {}),
          ...(expiresAt ? { expiresAt } : {}),
        },
      };
    }
    case "BEARER_TOKEN": {
      const token = str(values.token);
      if (token.length < 8 || token.length > 8192) {
        return { ok: false, error: "Enter a valid bearer token." };
      }
      return { ok: true, credential: { kind: "BEARER_TOKEN", token } };
    }
    case "BASIC": {
      const username = str(values.username);
      const password = str(values.password);
      if (!username || username.length > 256 || !password || password.length > 1024) {
        return { ok: false, error: "Enter a valid username and password." };
      }
      return {
        ok: true,
        credential: { kind: "BASIC", username, password },
      };
    }
    default:
      return { ok: false, error: "Unsupported authentication method." };
  }
}

export function serializeCredentialForStorage(
  payload: IntegrationCredentialPayload,
): string {
  return JSON.stringify(payload);
}

export function parseStoredCredential(
  plaintext: string,
): IntegrationCredentialPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new IntegrationError(
      "CREDENTIAL_UNAVAILABLE",
      "Stored integration credential could not be decoded.",
    );
  }

  const result = parseIntegrationCredentialInput({
    authKind:
      typeof parsed === "object" && parsed !== null
        ? (parsed as { kind?: unknown }).kind
        : undefined,
    ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
  } as Parameters<typeof parseIntegrationCredentialInput>[0]);

  if (!result.ok) {
    throw new IntegrationError(
      "CREDENTIAL_UNAVAILABLE",
      "Stored integration credential is invalid.",
    );
  }
  return result.credential;
}
