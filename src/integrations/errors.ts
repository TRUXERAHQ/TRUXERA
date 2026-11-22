export const INTEGRATION_ERROR_CODES = [
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_FAILED",
  "RATE_LIMITED",
  "NETWORK_FAILURE",
  "PROVIDER_UNAVAILABLE",
  "INVALID_PAYLOAD",
  "MAPPING_FAILURE",
  "VALIDATION_FAILURE",
  "DUPLICATE_CONFLICT",
  "PROVIDER_ERROR",
  "NOT_CONNECTED",
  "CONNECTOR_UNAVAILABLE",
  "CREDENTIAL_UNAVAILABLE",
  "INTEGRATION_DISABLED",
] as const;
export type IntegrationErrorCode = (typeof INTEGRATION_ERROR_CODES)[number];

const RETRYABLE_CODES = new Set<IntegrationErrorCode>([
  "RATE_LIMITED",
  "NETWORK_FAILURE",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_ERROR",
]);

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly retryable: boolean;

  constructor(code: IntegrationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IntegrationError";
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
  }
}

const SECRET_PATTERNS = [
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /(?:api[_-]?key|token|secret|password|authorization)["'\s:=]+["']?[a-z0-9._~+/=-]{8,}["']?/gi,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[redacted]");
  }
  return result;
}

export function toSafeIntegrationError(error: unknown): {
  code: IntegrationErrorCode;
  message: string;
  retryable: boolean;
} {
  if (error instanceof IntegrationError) {
    return {
      code: error.code,
      message: redactSecrets(error.message),
      retryable: error.retryable,
    };
  }

  const raw = error instanceof Error ? error.message : String(error);
  return {
    code: classifyIntegrationError(error),
    message: redactSecrets(raw).slice(0, 500),
    retryable: true,
  };
}

export function classifyIntegrationError(error: unknown): IntegrationErrorCode {
  if (error instanceof IntegrationError) return error.code;

  const message = error instanceof Error ? error.message : String(error ?? "");
  const status = extractStatus(error);
  const lower = message.toLowerCase();

  if (status === 401 || /unauthorized|invalid[_ ]?(api[_ ]?)?key|authentication/.test(lower)) {
    return "AUTHENTICATION_FAILED";
  }
  if (status === 403 || /forbidden|permission|not authorized/.test(lower)) {
    return "AUTHORIZATION_FAILED";
  }
  if (status === 429 || /rate.?limit|too many requests|throttl/.test(lower)) {
    return "RATE_LIMITED";
  }
  if (status === 503 || status === 502 || /unavailable|maintenance|timeout|timed out|econnrefused|enotfound|eai_again|socket hang up/.test(lower)) {
    return status === 503 || status === 502
      ? "PROVIDER_UNAVAILABLE"
      : "NETWORK_FAILURE";
  }
  if (/duplicate|conflict|already exists/.test(lower)) {
    return "DUPLICATE_CONFLICT";
  }
  if (/invalid|malformed|schema|parse|validation/.test(lower)) {
    return "INVALID_PAYLOAD";
  }

  return "PROVIDER_ERROR";
}

function extractStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === "number") return value;
  }
  return null;
}
