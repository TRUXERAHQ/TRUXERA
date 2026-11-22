# McLeod LoadMaster — Connector #1 Implementation Specification

Status: **Phase 1B-B implemented on `staging`** — `mcleod-track-and-trace`
connector (Track & Trace sandbox only), `API_KEY_BEARER` composite auth,
normalized LOAD/DELIVERY external records via the Phase 1A framework.
api1 drivers/tractors/movements remain out of scope (need a real tenant).

Sources: McLeod Innovation Hub (Tyk portal), official OpenAPI documents
(`/documentation/raw`), McLeod API overview page. Verified 2026-11-22.

---

## 1. Products evaluated

| Product | Base URL (sandbox / live) | Auth | Verdict for Connector #1 |
|---|---|---|---|
| **Track and Trace** | `trackandtrace-sandbox` / `trackandtrace` | Bearer token + `X-Api-Key` + `X-Mcld-Tenant` | **Primary — order + stop + ETA + progress data** |
| **McLeod API (api1)** | `api1` (live only in published spec) | Basic auth + `X-Api-Key` + `X-Mcld-Tenant` | **Secondary — drivers, tractors, movements, customers, stops** (needs real customer tenant) |
| **Location Matching** | `locationmatching-sandbox` / `locationmatching` | Bearer + `X-Api-Key` + `X-Mcld-Tenant` | Optional Phase 2 — location master/geocoding enrichment |
| **Symphony (SMCS)** | `smcs-sandbox` / `smcs` | Basic + `x-api-key` + `x-routing-token` + tenant | **Not for Connector #1** — telematics/ELD partner channel, requires McLeod qualified-vendor status; mostly push-oriented |
| Vehicle Maintenance | `vehiclemaintenance-*` | Bearer + key + tenant | Out of scope — maintenance vendor data exchange |
| Dispatch Optimization | — | — | **Pre-release — do not depend on** |
| Order Creation, Quick-Quote, MPact, DocumentPower, DFM, AR Financing | various | various | Out of scope |

**Minimum viable Connector #1 = Track and Trace only.** It alone covers
orders, stops, schedules, ETAs, actuals, and progress/telemetry events.
Equipment/driver/assignment require api1 with a real customer tenant —
phase 1B-B.

## 2. Sandbox access — what is required

Self-serve, no sales approval for the **trial**:

1. Register at `https://innovationhub.mcleodsoftware.com/register/`
   (email, password, company name, SCAC, customer type, bio, ToS).
2. Request a **trial key** per API from the catalog
   (`/member/policies/{id}/request`). **Trial keys expire after 7 days.**
3. Get a quick sandbox bearer token at
   `https://controlhub.mcleodsoftware.com/?action=Sandbox`.

Sandbox request headers (all three required):

| Header | Sandbox value | Secret? |
|---|---|---|
| `Authorization` | `Bearer <quick-access token>` | **Yes** |
| `X-Api-Key` | trial key from Innovation Hub | **Yes** (org-level credential) |
| `X-Mcld-Tenant` | `2` | No — metadata |
| `X-Correlation-Id` | optional UUID | No |

Base URL: `https://api.mcleodsoftware.com/trackandtrace-sandbox`

**Verified live probe (2026-11-22):** `GET /orders` without credentials →
`401 {"error":"Authorization field missing"}` — endpoint is up, auth is
enforced before key checks. No authenticated call possible until a human
completes steps 1–3 above.

**Limitations:** trial key 7-day expiry; sandbox tenant `2` serves McLeod
demo data (not a real customer tenant); production access requires the
customer's own McLeod tenant id + production API key (approval-gated).

## 3. Track & Trace endpoint inventory (confirmed via OpenAPI)

### `GET /orders` — Orders List
Query: `status` (Available|Scheduled|InProgress|Delivered|Void|Quote),
`startItem` (pagination cursor; `X-Mcld-Next-Item` response header).
Returns active orders placed in the **past 30 days** (filtered on
`scheduledArrivalEarly`).

### `GET /orders/{id}` — Order Detail
Same order fields **plus**:
- `charges` — freight/other/total (MultiCurrency)
- `progressUpdates[]` — `{ event: "Telemetry"|"Callin", timestamp,
  position: {latitude, longitude, city, state, postalCode},
  milesToConsignee }` — real position events!

### Order schema (both endpoints)
`orderId` (readOnly unique id), `status` enum, `consigneeReferenceNumber`,
`shipmentId`, `billToCustomerCode`, `shipperStop`, `consigneeStop`,
`intermediateStops[]`.

### Stop schema
`sequenceNumber`, `city`, `state`, `postalCode`, `latitude`, `longitude`,
`eta` (ISO UTC), `scheduledArrivalEarly`, `scheduledArrivalLate`,
`actualArrivalEarly` (= actual arrival), `actualArrivalLate`
(= actual departure), `appointmentRequired`, `appointmentConfirmed`,
`referenceNumbers[] {qualifierCode, referenceNumber}`.

### What T&T does NOT provide
Truck/equipment id, driver id/name, assignment/dispatch linkage, customer
names (only `billToCustomerCode`), weight/cargo, rate confirmation docs.
→ available via api1 (`/drivers`, `/drivers/{id}/assignments`,
`/tractors`, `/movements/{id}`, `/stops/{id}`, `/customers`) with a real
tenant, or via future ELD/telematics connectors.

## 4. TRUXERA entity mapping (T&T only)

| McLeod | TRUXERA | Transform | Req? | Production-safe? | If missing |
|---|---|---|---|---|---|
| `orderId` | `ExternalRecord.externalId` (kind `LOAD`) + `Load.reference` | string as-is | required | yes — stable unique id | skip record, count failed |
| `consigneeReferenceNumber` | `Load.cargoDescription`? No — store in normalized payload; `Load.reference` prefers orderId | — | optional | yes | null |
| `status` | order-level signal in normalized payload; drives Delivery.status only via stop actuals | map InProgress→active, Delivered→complete | required | yes | treat as PLANNED |
| `billToCustomerCode` | `Load.customerName` | code string (name resolution later via api1 `/customers`) | optional | partial — it's a code not a name | "Unknown customer" |
| `shipperStop` | `Load.pickupAddress` = `city, state postalCode`; `pickupWindowStart/End` = `scheduledArrivalEarly/Late`; actuals → event | compose address; parse ISO | required for load | yes | load flagged insufficient-data |
| `consigneeStop` + `intermediateStops` | `Delivery` rows: `stopNumber`=`sequenceNumber` (re-indexed 1..n with pickup first), `destinationAddress`, `deliveryWindowStart/End`, `eta`, `deliveredAt` from `actualArrivalEarly` when Delivered | per-stop mapping | required | yes | stop skipped + issue logged |
| `eta` | `Delivery.eta` | ISO → DateTime | optional | yes | null (honest) |
| `progressUpdates[]` | normalized payload on `ExternalRecord` (kind `DELIVERY`); candidate source for `DeliveryEvent` LOCATION_UPDATED later | keep raw array | optional | yes | none |
| `charges` | payload only — TRUXERA must not fabricate financials | store, don't display as fact | optional | n/a | null |

**Explicit non-mappings:** no McLeod field maps to Truck/Driver/
DispatchAssignment in T&T. Do not invent them. `Delivery.riskLevel`
stays TRUXERA-computed — external data never writes it.

## 5. Intelligence compatibility (Detect→…→Summary)

| Workflow stage | Feasible with T&T? | Signal |
|---|---|---|
| Detect | Partial | order status transitions, missed `scheduledArrivalEarly` vs `actualArrival*`, ETA drift vs schedule |
| Predict | Partial | ETA + scheduled windows + progressUpdates positions → lateness risk; **no** driver-hours/HOS, no live GPS trail beyond sparse Telemetry events |
| Recommend | Partial | reassignment needs Truck/Driver candidates — **requires api1 or manual V1 data**; T&T alone cannot see fleet availability |
| Recover | Same as above | recovery decisions still need resource data |
| Measure Impact | Partial | actual vs scheduled/ETA deltas are real and measurable |
| Generate Summary | Yes | order/stop/status/timing facts are reportable |

Honest gaps → "Insufficient data": driver identity/HOS, truck identity,
real-time position (sparse Telemetry/Callin events only), assignment
history. TRUXERA must keep showing insufficient-data states for those —
exactly as V1 does without telemetry.

## 6. Authentication → Phase 1A framework mapping

- **Credential type:** hybrid — `X-Api-Key` (long-lived org credential) +
  `Authorization: Bearer` (short-lived token; sandbox = manual quick-access
  token, production = likely OAuth client-credentials — confirm at key
  issuance).
- **Secrets:** bearer token → `OAUTH2` credential payload
  (`accessToken`, `expiresAt`); `X-Api-Key` → needs a home.
- **Metadata (Integration.config, non-secret):** `X-Mcld-Tenant`,
  base URL (`trackandtrace` vs `-sandbox`), product scope.
- **Gap found:** `IntegrationCredentialPayload` is a single-kind union —
  T&T needs **both** an API key and a bearer token. Minimal fix before
  Connector #1: either (a) extend the union with a composite
  `{ kind: "API_KEY_BEARER", apiKey, accessToken, expiresAt }`, or
  (b) treat `X-Api-Key` as config metadata (it's an org identifier, not a
  user secret — weaker but simpler). **Recommendation: (a)** — keeps all
  secrets in the vault. Small, additive change to `auth.ts`/`vault.ts`.
- Vault/cipher: **sufficient as-is** (AES-256-GCM, env-keyed,
  `INTEGRATION_CREDENTIALS_KEY` already set on Preview).

## 7. Rate limits / usage

Not publicly documented; the `X-Api-Key` is "associated to a policy that
sets API entitlements and rate limits." Framework already classifies 429 →
`RATE_LIMITED` (retryable). Connector should poll conservatively
(orders list is the only bulk endpoint; detail calls per orderId).

## 8. Connector implementation order (recommended)

1. Human obtains sandbox trial key + bearer token (7-day expiry — do this
   right before implementation).
2. Small auth extension (API_KEY_BEARER composite) + `mcleod-tnt`
   connector: `verifyConnection` → `GET /orders?status=InProgress`,
   `fetchChanges` → orders list + per-order detail, cursor =
   `X-Mcld-Next-Item`/`startItem` + last-sync timestamp.
3. Mappers: Order→LOAD, Stop→DELIVERY entities (normalized payloads first;
   decide merge-into-V1-tables policy before writing Load/Delivery rows).
4. Tests with recorded sandbox fixtures (no live calls in CI).
5. Phase 1B-B: api1 connector for drivers/tractors/movements/customers
   once a real tenant exists.

## 9. Blockers / unresolved questions

- **BLOCKER (human):** Innovation Hub account + T&T trial key + sandbox
  bearer token. Nothing else can proceed to live verification without them.
- Production auth flow for T&T (OAuth client credentials vs static token)
  — confirm when production key is issued.
- Whether sandbox Order Detail returns `progressUpdates` populated —
  verify on first authenticated call.
- api1 has no published sandbox server in the spec (live only) +
  Direct-Hosted MAP sandbox exists separately — clarify with McLeod.
- Merge policy: when/how ExternalRecord LOAD/DELIVERY entities materialize
  into V1 Load/Delivery tables (ownership + conflict rules) — decide in
  1B-A implementation plan review.
