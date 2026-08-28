# RevenueCat Webhooks — Official Documentation Research

Research date: **2026-08-29**. Scope: the common envelope plus these 7 event types: `TEST`, `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`, `BILLING_ISSUE`, `EXPIRATION`.

Everything below was taken from the live official docs on the research date (fetched raw HTML **and** the canonical Markdown `.md` variant that RevenueCat publishes for each docs page). Nothing is from memory. Where the docs are silent, this file says so explicitly.

---

## 1. Sources

### Fetched successfully (2026-08-29)

| # | URL | Format | Notes |
|---|-----|--------|-------|
| S1 | https://www.revenuecat.com/docs/integrations/webhooks | HTML (HTTP 200) | Overview: registration, auth header, HMAC, retries, timeout, testing, delivery delays, future-proofing, duplicates |
| S1m | https://www.revenuecat.com/docs/integrations/webhooks.md | Markdown (HTTP 200) | Canonical Markdown of S1 (`original_source: docs/integrations/webhooks.mdx`) |
| S2 | https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields | HTML (HTTP 200) | Envelope example, all event types, all field tables, enums, cancellation/expiration reasons |
| S2m | https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields.md | Markdown (HTTP 200) | Canonical Markdown of S2 |
| S3 | https://www.revenuecat.com/docs/integrations/webhooks/sample-events | HTML (HTTP 200) | Sample JSON payloads (20 code blocks) |
| S3m | https://www.revenuecat.com/docs/integrations/webhooks/sample-events.md | Markdown (HTTP 200) | Canonical Markdown of S3 — the JSON in section 5 is copied byte-for-byte from this file |
| S4 | https://www.revenuecat.com/docs/integrations/webhooks/event-flows | HTML (HTTP 200) | "Common Webhook Flows" |
| S4m | https://www.revenuecat.com/docs/integrations/webhooks/event-flows.md | Markdown (HTTP 200) | Canonical Markdown of S4 |
| S5 | https://www.revenuecat.com/docs/llms.txt and https://www.revenuecat.com/docs/integrations/llms.txt | text (HTTP 200) | Docs index. Confirms S1–S4 are the **only** four webhook pages in the official docs |
| C1 | https://community.revenuecat.com/sdks-51/type-definitions-for-webhook-events-4076 | HTML | Community thread; no TEST payload, no new facts |
| C2 | https://community.revenuecat.com/third-party-integrations-53/webhook-local-envirement-testing-5082 | HTML | Community thread; no TEST payload |
| C3 | https://community.revenuecat.com/general-questions-7/webhook-not-triggering-for-test-store-7054 | HTML | Community thread; no TEST payload |
| C4 | https://community.revenuecat.com/third-party-integrations-53/revenuecat-webhook-endpoint-php-integration-1430 | HTML | Community thread; only shows `case 'TEST':` in a PHP switch, no payload |

### Failed

| URL | Result | Impact |
|-----|--------|--------|
| https://www.revenuecat.com/docs_images/integrations/webhooks/webhook-test-event.png | HTTP 404 (referenced from S1 "Testing" section) | Cannot see the dashboard screenshot of the "test event" button. Text description in S1 is sufficient for behaviour, but the exact UI label is unknown. |

### Provisional-schema flags

- **TEST event: no official sample payload exists** on any official page (S1–S4) or in community threads C1–C4. The TEST schema must be built from the field-group statement in S2 ("Applicable fields: Common fields · Subscriber identity · Subscription lifecycle") and the S1 statement that it is a "purchase-like sample payload". Mark the TEST schema **PROVISIONAL**.
- Everything else in scope (envelope, 6 lifecycle events) is fully documented with samples and field tables — not provisional.

---

## 2. Transport, envelope, authorization, retries

Source: S1/S1m (overview) and S2/S2m ("Events format", "Common fields").

### HTTP method and body

> "RevenueCat will send `POST` requests to your server, in which the body will be a JSON representation of the notification." — S1

> "Webhook events are serialized in JSON. The body of a `POST` request to your server will contain the serialized event, as well as the API version." — S2

Content type: the docs say only that the body is JSON; no explicit `Content-Type` header value is documented. Assume `application/json` (standard) but note the docs do not state it.

Registration requires an **HTTPS** URL (S1 step 4: "Enter the HTTPS URL of the endpoint that you want to receive your webhooks").

### Envelope

Top-level body has exactly two keys (S2 "Common fields": "`api_version` is at the root of the POST body; the rest are inside the `event` object."):

```json
{
  "api_version": "1.0",
  "event": { ... }
}
```

- `api_version` — String. Documented value: `"1.0"` (every sample in S2 and S3 uses `"1.0"`). S1 "Future Proofing": "We may add new fields or event types in the future without changing the API version. We won't remove fields or events without proper API versioning and deprecation."
- `event` — Object containing `type`, `id`, `event_timestamp_ms`, `app_id` and the event-group-specific fields (section 3).

Key order in samples varies (`event` first, `api_version` last in S3; reverse in S2) — irrelevant to JSON parsing.

Verbatim envelope example from S2 ("Events format"):

```json
{
  "api_version": "1.0",
  "event": {
    "aliases": [
      "yourCustomerAliasedID",
      "yourCustomerAliasedID"
    ],
    "app_id": "yourAppID",
    "app_user_id": "yourCustomerAppUserID",
    "commission_percentage": 0.3,
    "country_code": "US",
    "currency": "USD",
    "entitlement_id": "pro_cat",
    "entitlement_ids": [
      "pro_cat"
    ],
    "environment": "PRODUCTION",
    "event_timestamp_ms": 1591121855319,
    "expiration_at_ms": 1591726653000,
    "id": "UniqueIdentifierOfEvent",
    "is_family_share": false,
    "offer_code": "free_month",
    "original_app_user_id": "OriginalAppUserID",
    "original_transaction_id": "1530648507000",
    "period_type": "NORMAL",
    "presented_offering_id": "OfferingID",
    "price": 2.49,
    "price_in_purchased_currency": 2.49,
    "product_id": "onemonth_no_trial",
    "purchased_at_ms": 1591121853000,
    "store": "APP_STORE",
    "subscriber_attributes": {
      "$Favorite Cat": {
        "updated_at_ms": 1581121853000,
        "value": "Garfield"
      }
    },
    "takehome_percentage": 0.7,
    "tax_percentage": 0.3,
    "transaction_id": "170000869511114",
    "type": "INITIAL_PURCHASE"
  }
}
```

### Authorization header — plain configured value (confirmed)

Source: S1.

Registration step 5: "(Optional) Set authorization header that will be sent with each POST request".

> "We recommended setting an authorization header value via the RevenueCat dashboard. When set, RevenueCat will send this header in every request. Your server can use this to authenticate the webhooks from RevenueCat." — S1, "Best Practices: Webhook authorization"

> "You can configure the authorization header used for webhook requests via the dashboard. Your server should verify the validity of the authorization header for every notification." — S1, "Security and Best Practices › Authorization"

**Confirmed:** it is a static, developer-chosen string sent as the `Authorization` header on every request; there is no signature, nonce, or derivation involved. Verification = constant-time string equality against the configured value. The docs do not prescribe any format (e.g. `Bearer …`) — the value is whatever the developer typed in the dashboard.

### Optional HMAC signature (separate, opt-in feature)

Source: S1 "Webhook Signature Verification (HMAC)". Not required for this project but documented for completeness:

- Opt-in per integration ("Toggle HMAC webhook signing to enable it").
- Header: `X-RevenueCat-Webhook-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>`
- "The HMAC-SHA256 is computed over `"<timestamp>.<raw_json_body>"` using your integration's signing secret."
- Must be computed over raw body bytes; use constant-time compare; optionally reject if `abs(now - t)` > tolerance (docs suggest 5 minutes).
- "RevenueCat recomputes `t` and `v1` on every delivery attempt, including automatic retries and a manual Retry from the dashboard."
- `t` is the request signing time, "not the payload's `event_timestamp_ms`".
- Signing secret is shown only once; can be rotated (old secret immediately invalidated).

### Response, timeout, retries, delivery semantics

Source: S1.

| Topic | Verbatim doc text |
|-------|-------------------|
| Success | "Your server should return a **200 status code**. Any other status code will be considered a failure by our backend." |
| Retries | "RevenueCat will retry later (up to 5 times) with an increasing delay (5, 10, 20, 40, and 80 minutes). After 5 retries, we will stop sending notifications." |
| Timeout | "If your server doesn't finish the response in 60s, RevenueCat will disconnect. We then retry up to 5 times. We recommend that apps respond quickly and defer processing until after the response has been sent." |
| Retry identity | "Retries reuse the payload `id` and `event_timestamp_ms`." (S1) / "Retries reuse the same `id` and `event_timestamp_ms`." (S2, Common fields) |
| Manual retry | "On the webhook integration page, locate the failed (or retrying) event in the table and click `Retry`. The webhook will be immediately dispatched to your webhook's URL." |
| Duplicates | "RevenueCat makes our best effort for “at least one delivery” of webhooks. In some rare situations, your application may receive a webhook for the same event more than once … We recommend you to guard against duplicated events by making your webhook processing idempotent. For example, you can keep track of the event `id` we send with each webhook to ensure you are processing the event only once." |
| Delivery delay | "Most webhooks are usually delivered within 5 to 60 seconds of the event occurring - cancellation events usually are delivered within 2hrs of the user cancelling their subscription." |
| Ordering | S4 (Billing Issue Flow): "the `BILLING_ISSUE`, `CANCELLATION`, and `EXPIRATION` (if no grace period is involved) webhooks are dispatched in order at the same time, so it is unlikely but possible to receive these events in a different order than described here due to network irregularities." No general ordering guarantee is documented. |
| Forward compat | "You should be able to handle webhooks that include additional fields to what's shown here, including new event types. We may add new fields or event types in the future without changing the API version." (S1) and "Keep in mind that webhooks can include additional fields to what's shown here." (S3) → **zod schemas must be non-strict / passthrough on unknown keys, and the `type` discriminator must tolerate unknown strings at the envelope level.** |
| Environment filter | Per integration you "Select whether to send events for production purchases, sandbox purchases, or both", optionally restrict to one app, and optionally "Filter the kinds of events that should be sent". |
| IP allowlist | Not documented on any of S1–S4. |

---

## 3. Event fields (complete, as documented)

Source: S2/S2m "Fields" section. The **Included** column semantics are defined by the docs verbatim:

> - **Always** — The JSON key is always included for the listed event types, but the value may still be null.
> - **Sometimes** — The key is only included when data is available; it may be omitted entirely from the payload.
> - **(blank)** — Nested field under a parent array or object. See the parent row for when the key is included.
>
> Parse defensively: treat Sometimes fields as optional keys, and don't assume Always fields are non-null. Some event types omit fields listed in a group, as noted in each section.

Zod mapping used below: **Always** → required key, `.nullable()` unless the doc gives a reason it cannot be null (be conservative: nullable); **Sometimes** → `.optional()` (and nullable where the doc says "can be null").

The 7 in-scope event types all use exactly three field groups (S2): **Common fields**, **Subscriber identity fields**, **Subscription lifecycle fields**. (TEST: "Applicable fields: Common fields · Subscriber identity · Subscription lifecycle"; the six lifecycle events: same three groups.)

### 3.1 Common fields — all event types including TEST

| Field | Type | Description (verbatim) | Included | Applies to |
|-------|------|------------------------|----------|-----------|
| `api_version` | String | API version of the webhook format. | Always | All (root of body, not inside `event`) |
| `type` | String | Type of the event. | Always | All |
| `id` | String | Unique identifier of the event. Retries reuse the same `id` and `event_timestamp_ms`. | Always | All |
| `event_timestamp_ms` | Integer | The time that the event was generated, which doesn't necessarily coincide with when the action that triggered the event occurred. Retries reuse the same `id` and `event_timestamp_ms`. | Always | All |
| `app_id` | String | Public identifier of the dashboard app (store configuration) associated with the event. Found in project settings. | Always, except when `store` is `PROMOTIONAL` or when the event has no linked app configuration (e.g. `EXPERIMENT_ENROLLMENT`). | All 7 in scope; may be absent when `store == "PROMOTIONAL"` → make `.optional()` |

### 3.2 Subscriber identity fields — TEST + the 6 lifecycle events

S2 note: "When looking up users from the webhook in your systems, make sure to search both the `original_app_user_id` and the `aliases` array."

| Field | Type | Description (verbatim) | Included |
|-------|------|------------------------|----------|
| `app_user_id` | String | Last seen App User ID of the subscriber. | Always |
| `original_app_user_id` | String | The first App User ID used by the subscriber. | Always |
| `aliases` | Array (of String) | All App User IDs ever used by the subscriber. | Always |
| `subscriber_attributes` | Map | Map of attribute names to attribute objects. See the customer attributes guide. | Sometimes |
| `experiments` | Array | Experiments the subscriber was enrolled in at event time. Each entry has the attributes listed below. | Sometimes |
| `experiments[].experiment_id` | String | ID of the experiment. | (nested) |
| `experiments[].experiment_variant` | String | Variant the subscriber was enrolled in. | (nested) |
| `experiments[].enrolled_at_ms` | Integer | When the subscriber was enrolled, in milliseconds since Unix epoch. This can be null. | (nested) |

`subscriber_attributes` value shape (from every sample in S2/S3; not tabulated in the field docs): `{ "<attribute name>": { "value": string, "updated_at_ms": integer } }`. Attribute names may start with `$` (reserved, e.g. `$email`, `$idfa`, `$appsflyerId`) or be custom (`favorite_food`, `$Favorite Cat`). The UNCANCELLATION sample shows it can be an empty object `{}`.

### 3.3 Subscription lifecycle fields — TEST + the 6 lifecycle events

| Field | Type | Description (verbatim) | Included | Event-type restriction (from description) |
|-------|------|------------------------|----------|-------------------------------------------|
| `product_id` | String | Product identifier of the subscription. For Google Play products set up in RevenueCat after February 2023, this identifier has the format `<subscription_id>:<base_plan_id>`. | Always | — |
| `period_type` | String | Period type of the transaction: `TRIAL`, `INTRO`, `NORMAL`, `PROMOTIONAL`, or `PREPAID`. | Always | — |
| `purchased_at_ms` | Integer | Time when the transaction was purchased, in milliseconds since Unix epoch. | Always | — |
| `expiration_at_ms` | Integer | Expiration of the transaction, in milliseconds since Unix epoch. This can be null for non-subscription purchases or lifetime products. | Always (nullable) | — |
| `environment` | String | Store environment: `SANDBOX` or `PRODUCTION`. | Always | — |
| `entitlement_id` | String | Deprecated. See `entitlement_ids`. | Always (null in most samples) | — |
| `entitlement_ids` | Array (of String) | Entitlement identifiers of the subscription. This can be null if the `product_id` is not mapped to any entitlements. | Always (nullable) | — |
| `presented_offering_id` | String | Offering presented during the initial purchase. This can be null. Not available for apps using legacy entitlements. | Always (nullable) | — |
| `transaction_id` | String | Transaction identifier from the store. | Always | — |
| `original_transaction_id` | String | `transaction_id` of the original transaction in the subscription. | Always | — |
| `is_family_share` | Boolean | Whether the purchase was shared via Family Sharing. This is always false for purchases made outside the App Store. | Always | — |
| `country_code` | String | ISO 3166-1 Alpha-2 country code derived from the subscriber's last seen location: `US`, `CA`, etc. | Always | — |
| `store` | String | Store the purchase belongs to: `AMAZON`, `APP_STORE`, `MAC_APP_STORE`, `PADDLE`, `PLAY_STORE`, `PROMOTIONAL`, `RC_BILLING`, `ROKU`, `STRIPE`, `TEST_STORE` | Sometimes | — |
| `currency` | String | ISO 4217 currency code. Can be null if unknown: `USD`, `CAD`, etc. | Sometimes (nullable) | — |
| `price` | Double | USD price of the transaction. This can be null if unknown, 0 for free trials, or negative for refunds. | Sometimes (nullable) | — |
| `price_in_purchased_currency` | Double | Price in the purchase currency. This can be null if unknown, 0 for free trials, or negative for refunds. | Sometimes (nullable) | — |
| `tax_percentage` | Double | Estimated tax percentage deducted from the transaction. This can be null if unknown. | Sometimes (nullable) | — |
| `commission_percentage` | Double | Estimated store commission percentage. This can be null if unknown. | Sometimes (nullable) | — |
| `takehome_percentage` | Double | Deprecated. Use `tax_percentage` and `commission_percentage` instead. | Sometimes | — |
| `offer_code` | String | Offer or promotion code used for the transaction. This can be null. Available for App Store and Google Play. | Sometimes (nullable) | — |
| `renewal_number` | Integer | Number of renewals this subscription has gone through. Starts at 1; trial conversions count as renewals. | Sometimes | — (not present in any sample) |
| `metadata` | Object | Developer-defined metadata attached to RevenueCat Billing transaction. | Sometimes | RC_BILLING only (not in any sample) |
| `discount_percentage` | Double | Discount percentage applied to the transaction. | Sometimes | "apply only to `INITIAL_PURCHASE`, `RENEWAL`, and `NON_RENEWING_PURCHASE`" |
| `discount_amount` | Double | Discount amount applied to the transaction. | Sometimes | same as above |
| `discount_identifier` | String | Identifier of the discount applied to the transaction. | Sometimes | same as above |
| `quantity` | Integer | Quantity purchased. This is only included in `NON_RENEWING_PURCHASE` for some projects. | Sometimes | NON_RENEWING_PURCHASE only (out of scope) |
| `grace_period_expiration_at_ms` | Integer | Grace period expiration. This is only included on `BILLING_ISSUE` and always present on that event type. This can be null. | Sometimes (globally) / **Always, nullable on BILLING_ISSUE** | BILLING_ISSUE only |
| `auto_resume_at_ms` | Integer | When a paused Google Play subscription resumes. This is only included on `SUBSCRIPTION_PAUSED` and always present on that event type. | Sometimes | SUBSCRIPTION_PAUSED only (out of scope) |
| `is_trial_conversion` | Boolean | Whether the previous period was a free trial. This is only included on `RENEWAL`. | Sometimes | RENEWAL only |
| `cancel_reason` | String | Reason for `CANCELLATION`. This isn't included on other events. See Cancellation and Expiration Reasons. | Sometimes | CANCELLATION only |
| `expiration_reason` | String | Reason for `EXPIRATION`. This isn't included on other events. See Cancellation and Expiration Reasons: `UNSUBSCRIBE`, `BILLING_ERROR`, `DEVELOPER_INITIATED`, `PRICE_INCREASE`, `CUSTOMER_SUPPORT`, `UNKNOWN`, `SUBSCRIPTION_PAUSED` | Sometimes | EXPIRATION only |
| `new_product_id` | String | Product the subscriber switched to. This is only included on `PRODUCT_CHANGE` for App Store, deferred Google Play changes, and RevenueCat Billing (where `product_id` is the product the subscriber switched from). This is omitted from the payload when null. | Sometimes | PRODUCT_CHANGE only (out of scope) |

Additional notes from S2:

- "Determine trial and subscription duration: Subtract `purchased_at_ms` from `expiration_at_ms` to get the period duration in milliseconds."
- "App Store renewal timestamps: For App Store renewals, Apple may charge up to 24 hours before the billing period starts, so `purchased_at_ms` (billing period start) can be later than `event_timestamp_ms` (when payment was collected)."

### 3.4 Fields NOT applicable to the 7 in-scope events

For completeness (so nobody adds them to the in-scope schemas): `transferred_from`, `transferred_to` (TRANSFER); `source`, `virtual_currency_transaction_id`, `adjustments[]`, `product_display_name`, `purchase_environment`, `updated_balance`, `ad_transaction_id` (VIRTUAL_CURRENCY_TRANSACTION); `experiment_id`, `experiment_variant`, `experiment_enrolled_at_ms`, `offering_id` (EXPERIMENT_ENROLLMENT); `redeemed_from`, `redeemed_by`, `redemption_outcome`, `redemption_platform`, `workflow_id`, `workflow_step_id`, `trace_id` (PURCHASE_REDEEMED). Source: S2.

---

## 4. Enumerations

Source: S2/S2m.

| Enum | Allowed values (verbatim) | Where documented |
|------|---------------------------|------------------|
| `type` (all event types) | `TEST`, `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`, `SUBSCRIPTION_PAUSED`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`, `SUBSCRIPTION_EXTENDED`, `REFUND_REVERSED`, `INVOICE_ISSUANCE`, `TRANSFER`, `TEMPORARY_ENTITLEMENT_GRANT`, `VIRTUAL_CURRENCY_TRANSACTION`, `EXPERIMENT_ENROLLMENT`, `PURCHASE_REDEEMED`, `SUBSCRIBER_ALIAS` (deprecated), `PRICE_INCREASE_CONSENT_REQUIRED`, `PRICE_INCREASE_CONSENT_APPROVED` | S2 "Event types". New types may be added without an API version bump (S1) |
| `store` | `AMAZON`, `APP_STORE`, `MAC_APP_STORE`, `PADDLE`, `PLAY_STORE`, `PROMOTIONAL`, `RC_BILLING`, `ROKU`, `STRIPE`, `TEST_STORE` | S2 "Subscription lifecycle fields › store" |
| `environment` | `SANDBOX`, `PRODUCTION` | S2 "Subscription lifecycle fields › environment"; S1 "Testing" |
| `period_type` | `TRIAL`, `INTRO`, `NORMAL`, `PROMOTIONAL`, `PREPAID` | S2 "Subscription lifecycle fields › period_type" |
| `cancel_reason` | `UNSUBSCRIBE`, `BILLING_ERROR`, `DEVELOPER_INITIATED`, `PRICE_INCREASE`, `CUSTOMER_SUPPORT`, `UNKNOWN` (`SUBSCRIPTION_PAUSED` is listed in the shared table but marked "only EXPIRATION event") | S2 "Cancellation and Expiration Reasons" |
| `expiration_reason` | `UNSUBSCRIBE`, `BILLING_ERROR`, `DEVELOPER_INITIATED`, `PRICE_INCREASE`, `CUSTOMER_SUPPORT`, `UNKNOWN`, `SUBSCRIPTION_PAUSED` | S2 "Subscription lifecycle fields › expiration_reason" and "Cancellation and Expiration Reasons" |
| `api_version` | `"1.0"` (only documented value) | S2 "Events format"; all samples |

### Cancellation and Expiration Reasons table (verbatim from S2)

| Reason | Description | App Store | Google Play | Amazon | Web | Promo |
|--------|-------------|-----------|-------------|--------|-----|-------|
| `UNSUBSCRIBE` | Subscriber canceled voluntarily. This event fires when a user unsubscribes, not when the subscription expires. | ✅ | ✅ | ✅ | ✅ | ❌ |
| `BILLING_ERROR` | Apple, Amazon, or Google could not charge the subscriber using their payment method. The `CANCELLATION` event with cancellation reason `BILLING_ERROR` is fired as soon as the billing issue has been detected. The `EXPIRATION` event with expiration reason `BILLING_ERROR` is fired if the grace period (if set up) has ended without recovering the payment, and the customer should lose access to the subscription. | ✅ | ✅ | ✅ | ❌ | ❌ |
| `DEVELOPER_INITIATED` | Developer canceled the subscription. | ✅ | ✅ | ❌ | ❌ | ✅ |
| `PRICE_INCREASE` | Subscriber did not agree to a price increase. | ✅ | ✅ | ❌ | ❌ | ❌ |
| `CUSTOMER_SUPPORT` | Customer received a refund from Apple support, a Google Play subscription was refunded through RevenueCat, an Amazon subscription was refunded through Amazon support, or a web (RevenueCat Billing or Stripe Billing) subscription was refunded. Note that this doesn't mean that a subscription's autorenewal preference has been deactivated since refunds can be given without canceling a subscription. Check the current subscription status to see whether the subscription is still active. | ✅ | ✅ | ✅ | ✅ | ❌ |
| `UNKNOWN` | Apple did not provide the reason for the cancellation. | ✅ | ❌ | ❌ | ❌ | ❌ |
| `SUBSCRIPTION_PAUSED` | The subscription expired because it was paused (only `EXPIRATION` event). | ❌ | ✅ | ❌ | ❌ | ❌ |

### Store-compatibility of the in-scope event types (verbatim from S2)

| Webhook Event Type | App Store | Google Play | Amazon | Stripe | Promo | Roku | RevenueCat Billing |
|--------------------|-----------|-------------|--------|--------|-------|------|--------------------|
| `TEST` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `INITIAL_PURCHASE` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `RENEWAL` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `CANCELLATION` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `UNCANCELLATION` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `EXPIRATION` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `BILLING_ISSUE` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

---

## 5. Per-event detail (7 in-scope types)

Descriptions are verbatim from S2 ("Event types"); flow notes from S4; samples are byte-for-byte from S3m (`sample-events.md`). All six lifecycle samples have root keys `["event", "api_version"]` and `"api_version": "1.0"`.

Every lifecycle sample contains this **baseline set of 28 keys** inside `event`:
`event_timestamp_ms, product_id, period_type, purchased_at_ms, expiration_at_ms, environment, entitlement_id, entitlement_ids, presented_offering_id, transaction_id, original_transaction_id, is_family_share, country_code, app_user_id, aliases, original_app_user_id, currency, price, price_in_purchased_currency, subscriber_attributes, store, takehome_percentage, tax_percentage, commission_percentage, offer_code, type, id, app_id, experiments`
(that is 29 including `experiments`). Per-event additions are listed under each type. Notably **absent** from every sample even though documented as "Sometimes": `renewal_number`, `metadata`, `discount_percentage`, `discount_amount`, `discount_identifier`.

### 5.1 TEST

- **Meaning (S2):** "`TEST` — RevenueCat issued a test event. This event uses a purchase-like sample payload and isn't persisted in production."
- **When it fires (S1 "Testing"):** "You can test your server side implementation by purchasing sandbox subscriptions or by issuing test webhook events through RevenueCat's dashboard." (Followed by a screenshot `webhook-test-event.png` — returned 404 on 2026-08-29.) It is manually triggered from the webhook integration page in the dashboard; it is not produced by any store event.
- **Fields (S2):** "Applicable fields: Common fields · Subscriber identity · Subscription lifecycle" — i.e. the same three groups as INITIAL_PURCHASE etc. (sections 3.1–3.3), with `type: "TEST"`.
- **Store compatibility row (S2):** App Store ✅, Google Play ✅, others ❌ — meaning the fake payload will carry `store` of `APP_STORE` or `PLAY_STORE`.
- **Sample payload:** **NONE published** on S1–S4 (checked all 20 JSON blocks on S3: none has `"type": "TEST"`). Community threads C1–C4 also lack one. → Build the TEST schema as the INITIAL_PURCHASE-shaped lifecycle schema with `type` literal `"TEST"`, all lifecycle/identity fields optional+nullable, and mark it **PROVISIONAL**. Do not persist TEST events as real purchases.

### 5.2 INITIAL_PURCHASE

- **Meaning (S2):** "`INITIAL_PURCHASE` — A new subscription was purchased."
- **When it fires (S4):** "Initial Purchase Flow: This flow occurs each time a customer purchases a product for the first time. A single customer may go through this flow multiple times if they purchase multiple products." Also fires with `period_type: "TRIAL"` when a trial starts ("an `INITIAL_PURCHASE` webhook is sent with a `period_type` of `TRIAL`"), for Google Play resubscriptions after expiry, and alongside `PRODUCT_CHANGE` for immediate Google Play product changes.
- **Event-specific fields:** none beyond the three groups. `discount_percentage`/`discount_amount`/`discount_identifier` may appear (S2: apply to INITIAL_PURCHASE, RENEWAL, NON_RENEWING_PURCHASE).
- **Fields present in sample (29):** baseline set. Null-valued in sample: `entitlement_id`, `presented_offering_id`, `offer_code`.
- **Sample (S3m, verbatim):**

```json
{
    "event": {
        "event_timestamp_ms": 1658726378679,
        "product_id": "com.subscription.weekly",
        "period_type": "NORMAL",
        "purchased_at_ms": 1658726374000,
        "expiration_at_ms": 1659331174000,
        "environment": "PRODUCTION",
        "entitlement_id": null,
        "entitlement_ids": [
            "pro"
        ],
        "presented_offering_id": null,
        "transaction_id": "123456789012345",
        "original_transaction_id": "123456789012345",
        "is_family_share": false,
        "country_code": "US",
        "app_user_id": "1234567890",
        "aliases": [
            "$RCAnonymousID:8069238d6049ce87cc529853916d624c"
        ],
        "original_app_user_id": "$RCAnonymousID:87c6049c58069238dce29853916d624c",
        "currency": "USD",
        "price": 4.99,
        "price_in_purchased_currency": 4.99,
        "subscriber_attributes": {
            "$email": {
                "updated_at_ms": 1662955084635,
                "value": "firstlast@gmail.com"
            }
        },
        "store": "APP_STORE",
        "takehome_percentage": 0.7,
        "tax_percentage": 0.0,
        "commission_percentage": 0.3,
        "offer_code": null,
        "type": "INITIAL_PURCHASE",
        "id": "12345678-1234-1234-1234-123456789012",
        "app_id": "1234567890",
        "experiments": [
            {
                "experiment_id": "prexp123",
                "experiment_variant": "b",
                "enrolled_at_ms": 1658726378679
            }
        ]
    },
    "api_version": "1.0"
}
```

### 5.3 RENEWAL

- **Meaning (S2):** "`RENEWAL` — An existing subscription was renewed, or a lapsed user resubscribed."
- **When it fires (S4):** each successful renewal; trial → paid conversion ("At this point, a `RENEWAL` event is dispatched and the user is billed for the subscription for the first time"); billing recovered during a grace period ("If billing succeeds at any point during the grace period, you'll receive a `RENEWAL` event"); Google Play resubscription during grace period; alongside `PRODUCT_CHANGE` for App Store immediate changes / any change at period end; and "If a user cancels their subscription and the trial expires, but they sign up for the subscription at a later date, this will be considered a trial conversion and a `RENEWAL` event will be dispatched."
- **Event-specific fields:** `is_trial_conversion` (Boolean, "only included on `RENEWAL`", Sometimes); `renewal_number` (Sometimes; not in sample); `discount_*` (Sometimes).
- **Fields present in sample (30):** baseline set + `is_trial_conversion`. Null-valued: `entitlement_id`, `presented_offering_id`, `offer_code`. Note `price` (USD, 8.14) differs from `price_in_purchased_currency` (EUR, 7.99).
- **Sample (S3m, verbatim):**

```json
{
    "event": {
        "event_timestamp_ms": 1658726405017,
        "product_id": "com.subscription.weekly",
        "period_type": "NORMAL",
        "purchased_at_ms": 1658755132000,
        "expiration_at_ms": 1659359932000,
        "environment": "PRODUCTION",
        "entitlement_id": null,
        "entitlement_ids": [
            "pro"
        ],
        "presented_offering_id": null,
        "transaction_id": "123456789012345",
        "original_transaction_id": "123456789012345",
        "is_family_share": false,
        "country_code": "DE",
        "app_user_id": "1234567890",
        "aliases": [
            "$RCAnonymousID:8069238d6049ce87cc529853916d624c"
        ],
        "original_app_user_id": "$RCAnonymousID:87c6049c58069238dce29853916d624c",
        "currency": "EUR",
        "is_trial_conversion": false,
        "price": 8.14,
        "price_in_purchased_currency": 7.99,
        "subscriber_attributes": {
            "$email": {
                "updated_at_ms": 1662955084635,
                "value": "firstlast@gmail.com"
            }
        },
        "store": "APP_STORE",
        "takehome_percentage": 0.7,
        "tax_percentage": 0.0,
        "commission_percentage": 0.3,
        "offer_code": null,
        "type": "RENEWAL",
        "id": "12345678-1234-1234-1234-123456789012",
        "app_id": "1234567890",
        "experiments": [
            {
                "experiment_id": "prexp123",
                "experiment_variant": "b",
                "enrolled_at_ms": 1762274791000
            }
        ]
    },
    "api_version": "1.0"
}
```

### 5.4 CANCELLATION

- **Meaning (S2):** "`CANCELLATION` — A subscription or non-renewing purchase was canceled or refunded. In the case of refunds, a subscription's auto-renewal setting may still be active. See cancellation reasons for more details. In the case of subscription refunds, this event fires only when the latest subscription period is refunded; refunds for earlier periods do not trigger it."
- **When it fires (S4):** user turns off auto-renew ("When a customer cancels their subscription, a `CANCELLATION` webhook is sent. At the end of the billing cycle, an `EXPIRATION` webhook is sent and entitlements are revoked."); billing failure ("RevenueCat will immediately dispatch a `BILLING_ISSUE` event and a `CANCELLATION` event with a `cancel_reason` of `BILLING_ERROR`"); refunds (`cancel_reason: CUSTOMER_SUPPORT`); cancel during trial. S1: "cancellation events usually are delivered within 2hrs of the user cancelling their subscription." Apple note (S4): "If a user cancels less than 24 hours before the trial expires, you may unexpectedly receive a `CANCELLATION` event followed by a `RENEWAL` event."
- **Event-specific fields:** `cancel_reason` (String enum, "Reason for `CANCELLATION`. This isn't included on other events.", Sometimes). Access is **not** revoked on this event.
- **Fields present in sample (30):** baseline set + `cancel_reason`. Null-valued: none (all keys populated). `price` is `0.0` in the sample.
- **Sample (S3m, verbatim):**

```json
{
  "event": {
    "event_timestamp_ms": 1601337615995,
    "product_id": "com.revenuecat.myapp.weekly",
    "period_type": "NORMAL",
    "purchased_at_ms": 1601417766000,
    "expiration_at_ms": 1602022566000,
    "environment": "PRODUCTION",
    "entitlement_id": "pro",
    "entitlement_ids": [
      "pro"
    ],
    "presented_offering_id": "defaultoffering",
    "transaction_id": "100000000000002",
    "original_transaction_id": "100000000000000",
    "is_family_share": false,
    "country_code": "US",
    "app_user_id": "$RCAnonymousID:12345678-1234-1234-1234-123456789123",
    "aliases": [
      "$RCAnonymousID:12345678-1234-ABCD-1234-123456789123",
      "user_1234"
    ],
    "offer_code": "free_month",
    "original_app_user_id": "$RCAnonymousID:12345678-1234-ABCD-1234-123456789123",
    "cancel_reason": "UNSUBSCRIBE",
    "currency": "USD",
    "price": 0.0,
    "price_in_purchased_currency": 0.0,
    "subscriber_attributes": {
      "$idfa": {
        "value": "12345678-1234-1234-1234-12345678912x",
        "updated_at_ms": 1578018408238
      },
      "$appsflyerId": {
        "value": "1234567891234-1234567",
        "updated_at_ms": 1578018408238
      },
      "favorite_food": {
        "value": "pizza",
        "updated_at_ms": 1578018408238
      }
    },
    "store": "APP_STORE",
    "takehome_percentage": 0.7,
    "tax_percentage": 0.0,
    "commission_percentage": 0.3,
    "type": "CANCELLATION",
    "id": "12345678-ABCD-1234-ABCD-12345678912",
    "app_id": "1234567890",
    "experiments": [
      {
        "experiment_id": "prexp123",
        "experiment_variant": "b",
        "enrolled_at_ms": 1762274791000
      }
    ]
  },
  "api_version": "1.0"
}
```

(S3 also has a second CANCELLATION sample under the "Refund" tab with `cancel_reason: "CUSTOMER_SUPPORT"` and negative prices — out of scope for this file but confirms `price` can be negative.)

### 5.5 UNCANCELLATION

- **Meaning (S2):** "`UNCANCELLATION` — A non-expired canceled subscription was re-enabled."
- **When it fires (S4):** "Uncancellations occur when a customer cancels their subscription and then resubscribes before the subscription's expiration occurs. In this scenario, the customer never loses entitlements."
- **Store compatibility:** not supported on Stripe or Promo (S2 table).
- **Event-specific fields:** none beyond the three groups.
- **Fields present in sample (29):** baseline set. Null-valued: `entitlement_id`, `offer_code`. `subscriber_attributes` is `{}` (empty object) — schema must accept an empty map. `price` is `0.0`.
- **Sample (S3m, verbatim):**

```json
{
    "event": {
        "event_timestamp_ms": 1663982135337,
        "product_id": "com.subscription.monthly",
        "period_type": "NORMAL",
        "purchased_at_ms": 1662643092000,
        "expiration_at_ms": 1665235092000,
        "environment": "PRODUCTION",
        "entitlement_id": null,
        "entitlement_ids": [
            "plus"
        ],
        "presented_offering_id": "plus",
        "transaction_id": "123456789012345",
        "original_transaction_id": "123456789012345",
        "is_family_share": false,
        "country_code": "US",
        "app_user_id": "1234567890",
        "aliases": [
            "$RCAnonymousID:8069238d6049ce87cc529853916d624c"
        ],
        "original_app_user_id": "$RCAnonymousID:87c6049c58069238dce29853916d624c",
        "currency": "USD",
        "price": 0.0,
        "price_in_purchased_currency": 0.0,
        "subscriber_attributes": {},
        "store": "APP_STORE",
        "takehome_percentage": 0.7,
        "offer_code": null,
        "tax_percentage": 0.0,
        "commission_percentage": 0.3,
        "type": "UNCANCELLATION",
        "id": "12345678-1234-1234-1234-123456789012",
        "app_id": "1234567890",
        "experiments": [
            {
                "experiment_id": "prexp123",
                "experiment_variant": "b",
                "enrolled_at_ms": 1762274791000
            }
        ]
    },
    "api_version": "1.0"
}
```

### 5.6 BILLING_ISSUE

- **Meaning (S2):** "`BILLING_ISSUE` — An attempt to charge the subscriber failed. This doesn't mean the subscription has expired. You can safely ignore this event if you listen for `CANCELLATION` with `cancel_reason=BILLING_ERROR`."
- **When it fires (S4):** "If a customer with an active subscription encounters a billing issue, RevenueCat will immediately dispatch a `BILLING_ISSUE` event and a `CANCELLATION` event with a `cancel_reason` of `BILLING_ERROR`. If you do not have grace periods enabled, you'll immediately receive an `EXPIRATION` webhook and the customer's entitlements will be revoked. If you do have grace periods enabled, the customer will retain entitlements as the app store retries the customer's billing method. At the end of the grace period, if billing has not been successful, an `EXPIRATION` event will be sent and entitlements will be revoked. If billing succeeds at any point during the grace period, you'll receive a `RENEWAL` event and entitlements won't be revoked." The three events "are dispatched in order at the same time" but may arrive out of order.
- **Event-specific fields:** `grace_period_expiration_at_ms` (Integer, "This is only included on `BILLING_ISSUE` and always present on that event type. This can be null.") → in the BILLING_ISSUE schema: **required key, nullable**.
- **Fields present in sample (30):** baseline set + `grace_period_expiration_at_ms`. Null-valued: none. Note this sample uses `"price" : 0` (integer literal, not `0.0`) and spaces before colons — the schema must accept integer-valued numbers for Double fields.
- **Sample (S3m, verbatim):**

```json
{
  "event" : {
    "event_timestamp_ms" : 1601337601013,
    "product_id" : "com.revenuecat.myapp.monthly",
    "period_type" : "NORMAL",
    "purchased_at_ms" : 1598640647000,
    "expiration_at_ms" : 1601319047000,
    "grace_period_expiration_at_ms" : 1601933447000,
    "environment" : "PRODUCTION",
    "entitlement_id" : "pro",
    "entitlement_ids" : [
      "pro"
    ],
    "presented_offering_id" : "defaultoffering",
    "transaction_id" : "100000000000002",
    "original_transaction_id" : "100000000000000",
    "is_family_share" : false,
    "country_code" : "US",
    "app_user_id" : "$RCAnonymousID:12345678-1234-1234-1234-123456789123",
    "aliases" : [
      "$RCAnonymousID:12345678-1234-1234-1234-123456789123"
    ],
    "offer_code": "summer_special",
    "original_app_user_id" : "$RCAnonymousID:12345678-1234-1234-1234-123456789123",
    "currency" : "USD",
    "price" : 0,
    "price_in_purchased_currency" : 0,
    "subscriber_attributes" : {
      "$idfa" : {
        "value" : "12345678-1234-1234-1234-12345678912x",
        "updated_at_ms" : 1578018408238
      },
      "$appsflyerId" : {
        "value" : "1234567891234-1234567",
        "updated_at_ms" : 1578018408238
      }
    },
    "store" : "APP_STORE",
    "takehome_percentage" : 0.7,
    "tax_percentage": 0.0,
    "commission_percentage": 0.3,
    "type" : "BILLING_ISSUE",
    "id" : "12345678-1234-1234-1234-12345678912",
    "app_id" : "1234567890",
    "experiments": [
      {
        "experiment_id": "prexp123",
        "experiment_variant": "b",
        "enrolled_at_ms": 1762274791000
      }
    ]
  },
  "api_version" : "1.0"
}
```

### 5.7 EXPIRATION

- **Meaning (S2):** "`EXPIRATION` — A subscription has expired. The associated user's access should be removed. With Platform Server Notifications configured, this event occurs within seconds to minutes of expiration. Without notifications, the event might be delayed by approximately 1 hour."
- **When it fires (S4):** end of billing cycle after a `CANCELLATION`; immediately after a billing issue when no grace period is configured, or at the end of an unsuccessful grace period (`expiration_reason: BILLING_ERROR`); end of a cancelled trial; when a paused Google Play subscription's term ends (`expiration_reason: SUBSCRIPTION_PAUSED` — S2: "Revoke access only on `EXPIRATION` with expiration reason `SUBSCRIPTION_PAUSED`"); after a failed validation of a `TEMPORARY_ENTITLEMENT_GRANT`.
- **Event-specific fields:** `expiration_reason` (String enum, "Reason for `EXPIRATION`. This isn't included on other events.", Sometimes).
- **Fields present in sample (30):** baseline set + `expiration_reason`. Null-valued: `entitlement_id`, `presented_offering_id`, `offer_code`. Sample uses `0.00` literals and non-zero `tax_percentage` (0.012).
- **Sample (S3m, verbatim):**

```json
{
  "event": {
    "event_timestamp_ms": 1697451462232,
    "product_id": "com.subscription.weekly",
    "period_type": "NORMAL",
    "purchased_at_ms": 1696846623000,
    "expiration_at_ms": 1697451423000,
    "environment": "PRODUCTION",
    "entitlement_id": null,
    "entitlement_ids": ["pro"],
    "presented_offering_id": null,
    "transaction_id": "123456789012345",
    "original_transaction_id": "123456789012345",
    "is_family_share": false,
    "country_code": "US",
    "app_user_id": "1234567890",
    "aliases": ["$RCAnonymousID:8069238d6049ce87cc529853916d624c"],
    "original_app_user_id": "$RCAnonymousID:8069238d6049ce87cc529853916d624c",
    "expiration_reason": "UNSUBSCRIBE",
    "currency": "USD",
    "price": 0.00,
    "price_in_purchased_currency": 0.00,
    "subscriber_attributes": {
        "$email": {
            "updated_at_ms": 1662955084635,
            "value": "firstlast@gmail.com"
        }
    },
    "store": "APP_STORE",
    "takehome_percentage": 0.7,
    "offer_code": null,
    "tax_percentage": 0.012,
    "commission_percentage": 0.3,
    "type": "EXPIRATION",
    "id": "12345678-1234-1234-1234-123456789012",
    "app_id": "1234567890",
    "experiments": [
      {
        "experiment_id": "prexp123",
        "experiment_variant": "b",
        "enrolled_at_ms": 1762274791000
      }
    ]
  },
  "api_version": "1.0"
}
```

---

## 6. TEST events — consolidated

Sources: S1 "Testing", S2 "Dashboard test" + field-group headers.

- **Trigger:** manual, from the RevenueCat dashboard (webhook integration page): "issuing test webhook events through RevenueCat's dashboard" (S1). No API endpoint to trigger it is documented. The illustrating screenshot (`webhook-test-event.png`) 404s.
- **Type value:** `"type": "TEST"`.
- **Nature:** "This event uses a purchase-like sample payload and isn't persisted in production." (S2) → do not treat as a real subscription state change; no customer record is created.
- **Fields:** Common fields (`api_version` at root; `type`, `id`, `event_timestamp_ms`, `app_id` in `event`) + Subscriber identity fields (`app_user_id`, `original_app_user_id`, `aliases`, `subscriber_attributes`?, `experiments`?) + Subscription lifecycle fields (`product_id`, `period_type`, `purchased_at_ms`, `expiration_at_ms`, `environment`, `entitlement_id`, `entitlement_ids`, `presented_offering_id`, `transaction_id`, `original_transaction_id`, `is_family_share`, `country_code`, and the "Sometimes" fields `store`, `currency`, `price`, `price_in_purchased_currency`, `tax_percentage`, `commission_percentage`, `takehome_percentage`, `offer_code`, …). S2 explicitly lists "Dashboard test" as an applicable event for all three groups.
- **Store compatibility:** App Store ✅, Google Play ✅ only (S2) — expect `store` of `APP_STORE` or `PLAY_STORE` in the fake payload.
- **Environment:** the docs do not state whether the TEST payload carries `SANDBOX` or `PRODUCTION`; the integration's environment filter ("production purchases, sandbox purchases, or both") is about real transactions.
- **Sample payload:** none published anywhere official. Because the docs call it "purchase-like", the safest schema is: lifecycle-event shape with `type: z.literal("TEST")`, every non-common field `.optional().nullable()`, `.passthrough()` for unknown keys. **PROVISIONAL** — validate against a real dashboard-issued TEST event once available and update this file.

---

## 7. Practical takeaways for the zod schemas

1. Envelope: `z.object({ api_version: z.string() /* "1.0" today */, event: EventSchema })`. Do not hard-fail on `api_version !== "1.0"`; log instead (S1 says fields/types can be added without a version bump).
2. Discriminate on `event.type`. Unknown `type` values must be accepted and routed to a fallback handler (new types are added without notice).
3. Use `.passthrough()` (or non-strict objects) everywhere — S1 and S3 both say extra fields may appear.
4. "Always" ≠ non-null: `entitlement_id`, `entitlement_ids`, `presented_offering_id`, `expiration_at_ms`, `offer_code` are null in official samples. `expiration_at_ms` is null for non-subscription/lifetime products.
5. `app_id` may be missing when `store === "PROMOTIONAL"` → optional.
6. Numbers: `price`, `price_in_purchased_currency`, `tax_percentage`, `commission_percentage`, `takehome_percentage` are Doubles that may be serialised as integers (`0`) — use `z.number()`, not `z.number().int()`. `price` can be `0`, negative (refunds), or null. All `*_ms` fields are integer milliseconds since Unix epoch.
7. Event-specific required keys: `grace_period_expiration_at_ms` on BILLING_ISSUE (nullable); `is_trial_conversion` only on RENEWAL (optional per docs, present in sample); `cancel_reason` only on CANCELLATION; `expiration_reason` only on EXPIRATION.
8. `subscriber_attributes`: `Record<string, { value: string; updated_at_ms: number }>`; may be `{}`; may be omitted.
9. `experiments`: optional array of `{ experiment_id: string; experiment_variant: string; enrolled_at_ms: number | null }`.
10. Idempotency key: `event.id` (retries reuse `id` and `event_timestamp_ms`). Respond `200` within 60 s; defer processing.
11. Auth: compare the incoming `Authorization` header to the configured static value with a constant-time comparison. Optional HMAC via `X-RevenueCat-Webhook-Signature` if enabled in the dashboard.
