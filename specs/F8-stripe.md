# F8 — Stripe in the generator (0.3.0)

Evidence-first: every rule below comes from the seven real events captured on 2026-08-29 (`test/fixtures/events/real/*.stripe.json`, see `docs/payload-sources.md` → Stripe) plus the official store-compatibility table.

## Generator rules for `store: stripe`
| Field | Value |
|-------|-------|
| `store` | `STRIPE` |
| `transaction_id` / `original_transaction_id` | one `si_` + 14 alphanumerics per subscription, **identical on every event** (renewals do not mint ids); a resubscription after `expired` creates a new one |
| `product_id` default | `prod_RccPremiumMonthly` (Stripe Product id shape); explicit values respected |
| `renewal_number` | emitted: 1 on `INITIAL_PURCHASE`, +1 on each `RENEWAL` **and** on `BILLING_ISSUE` (the failed attempt is counted); recovery `RENEWAL` does not increment |
| `BILLING_ISSUE` | `grace_period_expiration_at_ms: null`; `expiration_at_ms` extended by one period (invoice registered on creation) |
| recovery `RENEWAL` from `billing_issue` | `expiration_at_ms` unchanged, `is_trial_conversion: false` |
| `country_code` | `null` |
| `commission_percentage` / `takehome_percentage` / `tax_percentage` | `0` / `1` / `0` |
| `is_family_share` | `false` |
| everything else | as App Store (period_type TRIAL→NORMAL, price 0 on non-purchase events, reasons) |

## Legal events per store
`legalEvents(state, store)` / `transition(state, event, ctx)` gain a store dimension: for `stripe`, `UNCANCELLATION` and `TEST` are never legal (official compatibility table). The error names the store: `Stripe does not emit UNCANCELLATION (RevenueCat store compatibility table).` The prelude for `rcc send UNCANCELLATION --store stripe` therefore fails fast with that message.

## Surface
`--store stripe`, `subscriber.store: stripe`, config `store: stripe`; example `scenarios/stripe-billing-issue-recovers.yaml` (the captured flow, minus the resync mechanics); README store paragraph; CHANGELOG → 0.3.0.

## Not modelled (Icebox)
Stripe's simultaneous `CANCELLATION(BILLING_ERROR)` alongside `BILLING_ISSUE` stays a scenario author's choice (both are legal steps). RevenueCat Billing (`RC_BILLING`) shares the mechanics but was not captured.
