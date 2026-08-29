# F7 — Google Play in the generator (0.2.0)

Until 0.1.x the generator emitted App Store-shaped payloads only (`--store app_store`). This epic adds `play_store` with Google-shaped identifiers, keeping the same state machine and coherence rules.

## Sources (2026-08-29)
- RevenueCat event fields (S2): `product_id` for Google Play products created after Feb 2023 has the format `<subscription_id>:<base_plan_id>`; `store: PLAY_STORE`; `is_family_share` "always false for purchases made outside the App Store"; store-compatibility table lists all 7 v0.1 event types for Google Play; `SUBSCRIPTION_PAUSED` is a Play-only expiration reason (paused subscriptions are out of scope).
- RevenueCat sample events (S3): `PRODUCT_CHANGE` sample with `store: PLAY_STORE` uses `transaction_id` / `original_transaction_id` = `GPA.1234-1234-1234-12345`; an `INITIAL_PURCHASE` Play sample carries `period_type: TRIAL`.
- Google Play Billing, `Purchase.getOrderId()` reference (developer.android.com): renewal orders are the original order id with a `..N` suffix — "`GPA.1234-5678-9012-34567..0` indicating the first renewal order".
- Real capture: the dashboard `TEST` event is `store: PLAY_STORE` (test/fixtures/events/real/TEST.json).

## Generator rules for `play_store`
| Field | app_store (unchanged) | play_store |
|-------|------------------------|------------|
| `store` | `APP_STORE` | `PLAY_STORE` |
| initial `transaction_id` / `original_transaction_id` | 16-digit numeric string | `GPA.dddd-dddd-dddd-ddddd` (4-4-4-5 digits) |
| renewal `transaction_id` | new 16-digit string | `<original>..N`, N = 0 for the first renewal (trial conversion counts), then 1, 2, … |
| `original_transaction_id` on renewals | original | original (no suffix) |
| resubscribe after `expired` | keeps original id | **new** `GPA.…` order (a new purchase token); `original_transaction_id` becomes the new id |
| `product_id` default | `com.example.premium.monthly` | `com.example.premium:monthly` (RevenueCat `<subscription_id>:<base_plan_id>` format) — only when the user did not set `product_id` |
| `is_family_share` | `false` | `false` |
| everything else | — | identical (period_type, prices, grace period, reasons) |

Grace period default stays `P16D` for both stores (configurable per scenario); Play's actual grace window is a Play Console setting (3–30 days), not knowable by the tool.

## Surface
- `--store play_store` on `rcc send`; `subscriber.store: play_store` in scenarios; `store` in `reveclicat.config.json`.
- New example scenario `scenarios/play-trial-converts.yaml`.
- README store table; CHANGELOG `[Unreleased]` (→ 0.2.0, since it changes the CLI surface).
