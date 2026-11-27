# Samsara Integration — Readiness & Gap Map

Status: connector implemented and registered; OAuth flow implemented and
env-gated; live Samsara credentials not yet issued.

TRUXERA is a truck operations and recovery platform. Samsara is an
operational data provider. TRUXERA performs deterministic operational
analysis and produces recovery recommendations — Samsara data informs,
it never makes, the recovery decision.

## What exists today

| Capability | Implementation | State |
|---|---|---|
| Vehicles → TRUCK entities | `GET /fleet/vehicles` via `listAllPages` | Implemented |
| Drivers → DRIVER entities | `GET /fleet/drivers` | Implemented |
| Vehicle stats feed | `GET /fleet/vehicles/stats/feed` (`types` configurable, default `gps,engineStates`) → `VEHICLE_LOCATION`, `VEHICLE_MOTION_STATE` signals | Implemented |
| HOS / driver availability | `GET /fleet/hos/clocks` → `DRIVER_DUTY_STATUS` signals; non-fatal feed warning on failure (e.g. missing ELD scope) | Implemented |
| Entity linking | `samsaraFleetEntityExtractor`: vehicle `name`→unit number / VIN, driver `licenseNumber` | Implemented |
| Incremental sync | Cursor on stats feed only (`{stats: endCursor}`); entities checksum-idempotent | Implemented |
| Static token auth | `API_KEY_BEARER` credential via encrypted vault | Implemented |
| OAuth 2.0 auth | Authorization-code flow: start/callback routes, HMAC-signed single-use state, encrypted token storage, refresh-on-sync, best-effort provider revoke | Implemented, env-gated |
| Webhooks | TRUXERA provider-neutral `signals[]` contract only | Partial — see below |
| Diagnostics / fault signals | Not implemented | Boundary only — see below |

## OAuth flow

```
Customer → Settings → Connections → "Connect with Samsara"
  → GET /api/integrations/oauth/samsara/start?organizationId=…
  → Integration row (CONNECTING) + signed state hash in config
  → redirect to provider authorization URL
Provider → GET /api/integrations/oauth/samsara/callback?code&state
  → state signature + expiry + single-use hash verified
  → code exchanged at provider token endpoint
  → OAUTH2 credential stored AES-256-GCM encrypted
  → verifyConnection → CONNECTED (or ERROR)
```

- State: HMAC-SHA256 signed payload (integrationId, organizationId,
  providerKey, nonce, 10-minute expiry) keyed by `AUTH_SECRET`; the
  SHA-256 of the issued state is stored on the Integration config and
  consumed on callback (single-use, replay-safe).
- Token refresh: `runSyncForIntegration` refreshes an expired/near-expiry
  OAUTH2 credential via `refresh_token` grant before syncing and persists
  the rotated credential (`CREDENTIAL_ROTATED` event).
- Disconnect: local credential revocation always; provider-side revocation
  only when `SAMSARA_OAUTH_REVOKE_URL` is configured.
- Reconnect: DISCONNECTED/ERROR integrations restart the same flow;
  CONNECTED/SYNCING/DEGRADED must be disconnected first.

## Environment variables (all optional until Samsara issues access)

| Variable | Purpose |
|---|---|
| `INTEGRATION_CREDENTIALS_KEY` | AES-256-GCM key for the credential vault (required for ANY stored credential) |
| `SAMSARA_OAUTH_CLIENT_ID` | OAuth app client id |
| `SAMSARA_OAUTH_CLIENT_SECRET` | OAuth app client secret |
| `SAMSARA_OAUTH_AUTHORIZE_URL` | Provider authorization endpoint |
| `SAMSARA_OAUTH_TOKEN_URL` | Provider token endpoint |
| `SAMSARA_OAUTH_REVOKE_URL` | Optional revocation endpoint |
| `SAMSARA_OAUTH_SCOPES` | Optional space-separated scopes |
| `SAMSARA_OAUTH_REDIRECT_URI` | Optional pre-registered redirect override |

`isConfigured()` returns false until client id, secret, authorize URL, and
token URL are all present — the UI shows no Connect action until then.

## Explicit boundaries (do not guess — pending official Samsara docs)

- **OAuth endpoints/scopes**: read only from `SAMSARA_OAUTH_*` env vars.
  No Samsara URL, scope, or credential is hardcoded.
- **Webhooks**: only TRUXERA's provider-neutral contract is recognized —
  an envelope (`id` + `type`) carrying a `signals` array (top-level or
  under `payload`), ingested through the shared signal schema. Payloads
  without `signals` are recorded IGNORED. Native Samsara webhook payload
  mapping awaits partner documentation.
- **Diagnostics / fault codes**: no endpoint or field names are assumed.
  The stats feed `types` parameter is config-driven
  (`config.statsTypes` on the Integration row, default `gps,engineStates`);
  additional Samsara stat types (e.g. fault/diagnostic feeds) can be
  enabled by configuration once documented, and new signal kinds flow
  through the existing `ConnectorSignal` → `OperationalSignal` pipeline.
- **HOS scopes**: `/fleet/hos/clocks` requires the ELD compliance read
  scope; failure degrades to a feed warning, never a failed sync.
- **Vehicle stats types**: only `gps` and `engineStates` are normalized
  today; other `statsTypes` values are passed through to the provider but
  produce no signals until a normalizer is added.

## Mapping summary (provider-neutral)

| Samsara | TRUXERA |
|---|---|
| Vehicle `id`/`name`/`vin` | ExternalRecord TRUCK → Truck (unit number, VIN) |
| Driver `id`/`name`/`licenseNumber` | ExternalRecord DRIVER → Driver |
| `gps` events | `VEHICLE_LOCATION` signal (lat/lon/speed/heading/address) |
| `engineStates` events | `VEHICLE_MOTION_STATE` signal |
| `currentDutyStatus` + `clocks` | `DRIVER_DUTY_STATUS` signal (duty status + remaining durations) |

All signals carry `SOURCE_FACT` provenance, provider timestamps, dedupe
keys, and resolve to TRUXERA subjects only through verified entity links.
