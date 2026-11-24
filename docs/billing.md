# TRUXERA Billing Providers

TRUXERA billing is provider-neutral at the core. The commercial catalog,
entitlements, limits, grandfathered terms, and subscription state live in
`src/billing/billing.ts` and the `BillingSubscription` table — payment
providers are adapters behind `src/billing/provider.ts`.

```
TRUXERA Billing Core
→ BillingProvider (resolveBillingProvider)
→ PaddleProvider   (src/billing/paddle/)   — current provider, Sandbox only
→ StripeProvider   (src/billing/stripe/)   — preserved, test mode only
```

## Provider selection

`resolveBillingProvider()` resolves in this order:

1. `BILLING_PROVIDER` when set — must be `paddle` or `stripe` (unknown → none)
2. `PADDLE_API_KEY` when it is a Sandbox key (`pdl_sdbx_apikey_…`)
3. `STRIPE_SECRET_KEY` when set

Adapters fail closed: Paddle refuses non-`pdl_sdbx_apikey_` keys and
Stripe refuses non-`sk_test_` keys, so live credentials can never reach
the APIs from this codebase. When no provider resolves, the app remains
fully functional and `/dashboard/billing` shows an honest
"checkout unavailable" state.

## Paddle (current provider — Sandbox only)

Adapter: `src/billing/paddle/` (`client.ts`, `prices.ts`, `checkout.ts`,
`sync.ts`, `webhook.ts`).

### Environment variables (Preview/staging only)

| Variable | Purpose |
|---|---|
| `PADDLE_API_KEY` | Sandbox API key (`pdl_sdbx_apikey_…`) — server-only |
| `PADDLE_WEBHOOK_SECRET` | Notification destination secret (`pdl_ntfset_…`) |
| `PADDLE_PRICE_STARTER_MONTHLY` | Paddle Price ID (`pri_…`) for $399/mo |
| `PADDLE_PRICE_STARTER_ANNUAL` | Price ID for $3,828/yr |
| `PADDLE_PRICE_PROFESSIONAL_MONTHLY` | Price ID for $899/mo |
| `PADDLE_PRICE_PROFESSIONAL_ANNUAL` | Price ID for $8,628/yr |
| `BILLING_PROVIDER` | Optional explicit `paddle`/`stripe` selection |

Price IDs are provider identifiers resolved server-side — the browser
can only request plan + interval, never a price ID.

### Checkout

`startBillingCheckoutAction` (server action, shared by both providers)
validates plan/interval via `parseCheckoutRequest`, enforces
OWNER/ADMIN + ACTIVE organization, resolves the Paddle Price ID
server-side, and creates a Paddle transaction (`items: [{priceId,
quantity: 1}]`, `customData: {organizationId, plan, interval}`). The
Paddle-hosted `checkout.url` is returned for redirect. Paddle requires an
approved **default payment link** in Checkout settings for
`checkout.url` to be generated.

### Webhooks

`POST /api/webhooks/paddle` — excluded from the auth proxy via the
existing `api/webhooks` matcher exclusion.

Signature verification follows the official Paddle Billing scheme:
`Paddle-Signature: ts=<unix>;h1=<hmac>` where `h1` is
HMAC-SHA256(`${ts}:${rawBody}`, secret), constant-time compared, with a
5-minute timestamp tolerance. Raw body is used unmodified.

Handled events:

- `subscription.created|activated|updated|resumed|trialing|paused|past_due|canceled|imported` → subscription sync
- `transaction.completed|paid|billed` → recover PAUSED → ACTIVE
- `transaction.payment_failed` → PAUSED

Idempotency uses `BillingWebhookEvent` (`providerKey="paddle"`,
unique `providerEventId` = Paddle `event_id`); PROCESSED events are
deduplicated, FAILED events may retry.

Status mapping: `active`→ACTIVE, `trialing`→TRIAL, `past_due|paused`→PAUSED,
`canceled`→CANCELED, unknown→untouched.

### Customer/subscription mapping

`BillingSubscription.providerKey="paddle"`,
`providerCustomerId` = Paddle `ctm_…`, `providerSubscriptionId` =
`sub_…`. Plan resolves from `custom_data.plan` first, then reverse price
lookup. Override columns (grandfathered prices/limits) are never touched.

## Stripe (preserved)

`src/billing/stripe/` is unchanged and remains a valid provider.
Set `BILLING_PROVIDER=stripe` (with `STRIPE_*` test-mode env vars) to
select it, or remove Paddle env vars so auto-resolution falls through
to Stripe. Webhook: `POST /api/webhooks/stripe`.

## Switching to Paddle Live (future phase)

Requires a separate approved phase: live API key handling, live
Products/Prices, live webhook destination, `BILLING_PROVIDER` review,
and removal of the sandbox-only key guard in `client.ts`.
