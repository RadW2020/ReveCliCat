# Payload sources

Every field, enumeration and sample in `src/schemas/` traces back to the **official RevenueCat documentation**, read live on the date shown. Nothing comes from memory. Status per schema: `VERIFIED` (docs + official sample) or `PROVISIONAL` (docs without an official sample, or docs unreachable — needs a validation ticket).

Full research notes (verbatim quotes, complete field tables, all sample JSON): [`docs/research/revenuecat-webhooks-2026-08-29.md`](research/revenuecat-webhooks-2026-08-29.md).

## Sources consulted — 2026-08-29

| Ref | URL | Result |
|-----|-----|--------|
| S1 | https://www.revenuecat.com/docs/integrations/webhooks (+ `.md`) | 200 — overview, auth header, HMAC (opt-in), retries, timeout, testing, forward-compat |
| S2 | https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields (+ `.md`) | 200 — envelope, event types, field tables, enums, reasons |
| S3 | https://www.revenuecat.com/docs/integrations/webhooks/sample-events (+ `.md`) | 200 — sample JSON payloads (byte-for-byte copied into `test/fixtures/events/`) |
| S4 | https://www.revenuecat.com/docs/integrations/webhooks/event-flows (+ `.md`) | 200 — trial / cancellation / billing-issue flows |
| S5 | https://www.revenuecat.com/docs/llms.txt | 200 — confirms S1–S4 are the only webhook pages |
| — | https://www.revenuecat.com/docs_images/integrations/webhooks/webhook-test-event.png | **404** — dashboard screenshot only; no schema impact |

## Schema status

| Event type | Source | Sample | Status |
|------------|--------|--------|--------|
| Envelope (`api_version`, `event`) | S2 "Events format" | S2 | VERIFIED |
| `INITIAL_PURCHASE` | S2, S4 | S3 | VERIFIED |
| `RENEWAL` | S2, S4 | S3 | VERIFIED |
| `CANCELLATION` | S2, S4 | S3 | VERIFIED |
| `UNCANCELLATION` | S2, S4 | S3 | VERIFIED |
| `BILLING_ISSUE` | S2, S4 | S3 | VERIFIED |
| `EXPIRATION` | S2, S4 | S3 | VERIFIED |
| `TEST` | S1 "Testing", S2 (field groups) | **real capture** `test/fixtures/events/real/TEST.json` (2026-08-29) | VERIFIED (T-004) |

## Envelope & transport (S1, S2)
- `POST`, JSON body: `{ "api_version": "1.0", "event": { ... } }`. Only documented `api_version` is `"1.0"`; new fields/event types may appear **without** a version bump → schemas are non-strict (unknown keys pass through) and `api_version` is validated as a string.
- **Authorization:** a static, developer-chosen value configured in the dashboard, sent verbatim as the `Authorization` header on every request. No signature, no prescribed format. (An opt-in HMAC header `X-RevenueCat-Webhook-Signature: t=…,v1=…` exists; out of scope — Icebox.)
- Success = HTTP 200 within 60 s; otherwise up to 5 retries at 5/10/20/40/80 min reusing the same `id` and `event_timestamp_ms`; at-least-once delivery → dedupe on `event.id`.

## Field inclusion semantics (S2)
- **Always** = key present, value may be null → schema: required, `.nullable()` where docs say it can be null.
- **Sometimes** = key may be omitted → schema: `.optional()` (+ `.nullable()` where docs say so).
- Exception (deliberate, documented): `cancel_reason` on `CANCELLATION` and `expiration_reason` on `EXPIRATION` are **required** in our per-type schemas — they are the event's defining attribute and every official sample includes them. `grace_period_expiration_at_ms` is required-nullable on `BILLING_ISSUE` ("always present on that event type. This can be null").
- Doubles (`price`, `*_percentage`) may be serialised as integers (`0`) → `z.number()`, never `.int()`. All `*_ms` are integer ms since epoch.

## Field groups used by the 7 in-scope types (S2)
Common: `type`, `id`, `event_timestamp_ms`, `app_id` (optional — absent for `PROMOTIONAL`).
Subscriber identity: `app_user_id`, `original_app_user_id`, `aliases[]`, `subscriber_attributes{ name: { value, updated_at_ms } }` (Sometimes, may be `{}`), `experiments[]` (Sometimes).
Subscription lifecycle: `product_id`, `period_type`, `purchased_at_ms`, `expiration_at_ms` (nullable), `environment`, `entitlement_id` (nullable, deprecated), `entitlement_ids` (nullable), `presented_offering_id` (nullable), `transaction_id`, `original_transaction_id`, `is_family_share`, `country_code`; Sometimes: `store`, `currency`, `price`, `price_in_purchased_currency`, `tax_percentage`, `commission_percentage`, `takehome_percentage` (deprecated), `offer_code`, `renewal_number`, `metadata`, `discount_percentage`, `discount_amount`, `discount_identifier`; event-specific: `grace_period_expiration_at_ms` (BILLING_ISSUE), `is_trial_conversion` (RENEWAL), `cancel_reason` (CANCELLATION), `expiration_reason` (EXPIRATION).

## Enumerations (S2)
| Enum | Values |
|------|--------|
| `store` | `AMAZON`, `APP_STORE`, `MAC_APP_STORE`, `PADDLE`, `PLAY_STORE`, `PROMOTIONAL`, `RC_BILLING`, `ROKU`, `STRIPE`, `TEST_STORE` |
| `environment` | `SANDBOX`, `PRODUCTION` |
| `period_type` | `TRIAL`, `INTRO`, `NORMAL`, `PROMOTIONAL`, `PREPAID` |
| `cancel_reason` | `UNSUBSCRIBE`, `BILLING_ERROR`, `DEVELOPER_INITIATED`, `PRICE_INCREASE`, `CUSTOMER_SUPPORT`, `UNKNOWN` |
| `expiration_reason` | `UNSUBSCRIBE`, `BILLING_ERROR`, `DEVELOPER_INITIATED`, `PRICE_INCREASE`, `CUSTOMER_SUPPORT`, `UNKNOWN`, `SUBSCRIPTION_PAUSED` |

## Flow facts used by the state machine (S2, S4)
- Trial start = `INITIAL_PURCHASE` with `period_type: TRIAL`; trial → paid = `RENEWAL` (`is_trial_conversion: true`).
- Cancellation does not revoke access; `EXPIRATION` arrives at period end. Re-enabling before expiry = `UNCANCELLATION`.
- Billing failure: `BILLING_ISSUE` (+ a `CANCELLATION` with `cancel_reason: BILLING_ERROR` in the real flow); with a grace period, `RENEWAL` recovers or `EXPIRATION` (`expiration_reason: BILLING_ERROR`) churns.
- `EXPIRATION` after a voluntary cancel carries `expiration_reason: UNSUBSCRIBE`.

## TEST (VERIFIED 2026-08-29 by capture)
Docs: "RevenueCat issued a test event. This event uses a purchase-like sample payload and isn't persisted in production." No official sample exists, so we captured one: dashboard → Integrations → Webhooks → send test event, delivered through `rcc tail --smee` to `rcc listen --verbose` (project `mytestapp`, sandbox). Observed:
- Envelope `api_version: "1.0"`; `type: "TEST"`; `id` is an **upper-case** UUID; `app_id` present.
- Common + identity fields all present and non-null (`aliases` has two ids; `subscriber_attributes` carries RevenueCat's dummy `$email`, `$displayName`, `$phoneNumber` and a custom attribute).
- Lifecycle keys are present but **15 of them are `null`**: `entitlement_id`, `entitlement_ids`, `presented_offering_id`, `transaction_id`, `original_transaction_id`, `is_family_share`, `currency`, `price`, `price_in_purchased_currency`, `takehome_percentage`, `offer_code`, `tax_percentage`, `commission_percentage`, `metadata`, `renewal_number`. Non-null: `product_id: "test_product"`, `period_type: NORMAL`, `purchased_at_ms`, `expiration_at_ms` (+2 h), `environment: SANDBOX`, `country_code: US`, `store: PLAY_STORE`.
- Consequence: `TestEventSchema` = common + identity required, every lifecycle field `.nullable().optional()`. Lifecycle events keep the stricter "Always ⇒ non-null string/boolean" typing from the docs until a real capture says otherwise (T-063).
- Our first response was 400 (schema too strict) → RevenueCat scheduled retries; the retry is expected to reuse `id` and `event_timestamp_ms` (S1) — see WORKLOG T-004 for the observation.
