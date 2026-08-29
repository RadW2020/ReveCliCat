# F1 — State machine, virtual clock & payload generation

## Virtual clock (T-012)

- **Durations** are ISO-8601 `PnYnMnWnDTnHnMnS`. Grammar: `P` then at least one component; `T` separates time components; `W` may be combined with other components (relaxed vs. strict ISO, simpler for users: `P1M2W`). Fractions are not supported. Invalid → `InvalidDurationError` containing the input.
- **Arithmetic** is UTC and calendar-aware: years and months are added first with day-of-month clamping (Jan 31 + P1M = Feb 28/29), then weeks/days/hours/minutes/seconds as fixed milliseconds. Month arithmetic keeps the time-of-day.
- **VirtualClock** starts at `startMs`; `now()` returns ms; `advance(duration)` moves forward and returns the new `now()`. Advancing by a zero or negative duration throws (`ClockError`). The clock never moves backwards.
- **Determinism:** when a seed is given, the start is `2025-01-01T00:00:00Z` unless `startAt` is explicitly provided. Unseeded, start is `Date.now()`.

## Randomness (T-012)

- `createRng(seed)` → `Rng` with `next(): number ∈ [0,1)`, `int(maxExclusive)`, `uuid()`, `hex(n)`. Seed may be a number or string (strings are hashed with FNV-1a 32). Algorithm: mulberry32 (tiny, good enough for IDs).
- `uuid()` yields RFC-4122 v4-shaped strings (`xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`), deterministic per seed.
- `createRng()` with no seed uses `crypto.randomUUID()` / `Math.random()`.

## States & transitions (T-010)

States: `none`, `trial`, `active`, `cancelled_pending_expiration`, `billing_issue`, `expired`.

```
                INITIAL_PURCHASE (trial)            RENEWAL (conversion)
  none ───────────────────────────────▶ trial ─────────────────────────▶ active ◀──┐
   │      INITIAL_PURCHASE (no trial)     │                                 │  ▲    │ RENEWAL
   └──────────────────────────────────────┼─────────────────────────────────┘  │    │
                                          │ CANCELLATION / BILLING_ISSUE / EXPIRATION (same edges from active)
                                          ▼
   cancelled_pending_expiration ──UNCANCELLATION──▶ (back to trial|active)
          │  EXPIRATION                          billing_issue ──RENEWAL──▶ active
          ▼                                        │  EXPIRATION / CANCELLATION
        expired ◀──────────────────────────────────┘
          │  INITIAL_PURCHASE (resubscribe → active, no trial)
          └──────────────────────────────▶ active
```

| From | Event | To |
|------|-------|----|
| none | INITIAL_PURCHASE | trial (product has trial) / active |
| trial | RENEWAL | active (trial conversion) |
| trial | CANCELLATION | cancelled_pending_expiration |
| trial | BILLING_ISSUE | billing_issue |
| trial | EXPIRATION | expired |
| active | RENEWAL | active |
| active | CANCELLATION | cancelled_pending_expiration |
| active | BILLING_ISSUE | billing_issue |
| active | EXPIRATION | expired |
| cancelled_pending_expiration | UNCANCELLATION | state before cancellation (trial or active) |
| cancelled_pending_expiration | RENEWAL | active (recovery after a `BILLING_ERROR` cancellation — real Stripe capture; App Store "CANCELLATION followed by a RENEWAL" near trial end — docs S4) |
| cancelled_pending_expiration | EXPIRATION | expired |
| billing_issue | RENEWAL | active (recovery) |
| billing_issue | EXPIRATION | expired (churn) |
| billing_issue | CANCELLATION | cancelled_pending_expiration |
| expired | INITIAL_PURCHASE | active (resubscribe, no trial) |
| any | TEST | unchanged |

Store dimension (0.3.0): `legalEvents(state, store)` / `transition(state, event, { store })` drop the events a store never emits (official compatibility table): Stripe → no `UNCANCELLATION`, no `TEST`.

Anything else → `IllegalTransitionError` naming the current state, the attempted event and the legal events from that state. The transition function is pure: `transition(state, event, ctx) → nextState` with `ctx = { hasTrial, resumeState }`.

## Payload generation — `Subscriber` (T-011)

`new Subscriber(config, { clock, rng })` holds: state, identity (`app_user_id`, `original_transaction_id`, `app_id`), current period (`purchased_at_ms`, `expiration_at_ms`, `period_type`), latest `transaction_id`, `grace_period_expiration_at_ms`, `resumeState`, and the emitted history.

`emit(type, overrides?) → Event`:
1. `transition()` first — illegal → throws, nothing else changes (R8).
2. Time guards: `EXPIRATION` requires `clock.now() ≥ expiration_at_ms` (and `≥ grace_period_expiration_at_ms` from `billing_issue`); otherwise `PrematureEventError` telling the user how far to `advance` (R5/R6).
3. Build the payload from state + clock (below), apply dot-path `overrides`, validate with the event's zod schema (invalid → `RccError` naming the path), push to history, commit the new state.

Field derivation (App Store, v0.1):

| Event | period_type | purchased_at_ms | expiration_at_ms | transaction_id | price | specific |
|-------|-------------|-----------------|------------------|----------------|-------|----------|
| INITIAL_PURCHASE (trial) | TRIAL | now | now + trial | new = original | 0 | — |
| INITIAL_PURCHASE (no trial / resubscribe) | NORMAL | now | now + period | new (original kept on resubscribe) | price | — |
| RENEWAL | NORMAL | previous expiration (billing period start) | purchased + period | new | price | `is_trial_conversion` = was trial |
| CANCELLATION | unchanged | unchanged | unchanged | unchanged | 0 | `cancel_reason` (default `UNSUBSCRIBE`; `BILLING_ERROR` when cancelling from `billing_issue`) |
| UNCANCELLATION | unchanged | unchanged | unchanged | unchanged | 0 | — |
| BILLING_ISSUE | unchanged | unchanged | unchanged | unchanged | 0 | `grace_period_expiration_at_ms` = now + grace |
| EXPIRATION | unchanged | unchanged | unchanged | unchanged | 0 | `expiration_reason`: `BILLING_ERROR` from `billing_issue`, else `UNSUBSCRIBE` |
| TEST | as current (or as a fresh purchase when `none`) | | | | | state unchanged |

Constant per subscriber: `app_user_id` (`auto` → `$RCAnonymousID:<32 hex>` from the RNG), `original_app_user_id` = `app_user_id`, `aliases` = `[app_user_id]`, `app_id`, `product_id`, `store`, `environment`, `entitlement_ids` (default `["premium"]`), `entitlement_id: null`, `presented_offering_id: null`, `is_family_share: false`, `country_code` (default `US`), `currency` (default `USD`), `tax_percentage: 0`, `commission_percentage: 0.3`, `takehome_percentage: 0.7`, `offer_code: null`, `subscriber_attributes: {}`.

Transaction ids are App Store-like numeric strings (16 digits) drawn from the RNG; renewals get a new one, `original_transaction_id` never changes (R1).

## Coherence rules (T-011) — each has a dedicated test
1. Same `app_user_id`, `original_transaction_id`, `product_id` across the sequence; every RENEWAL has a fresh `transaction_id`.
2. `event_timestamp_ms` non-decreasing; `purchased_at_ms < expiration_at_ms`; `expiration_at_ms − purchased_at_ms` = one period (or the trial length in trial). App Store may bill up to 24 h before the period starts, so `purchased_at_ms` may exceed `event_timestamp_ms` on early renewals (docs S2) — we do not forbid it.
3. `period_type` = `TRIAL` during trial, `NORMAL` after conversion.
4. RENEWAL: new `expiration_at_ms` = previous `expiration_at_ms` + period.
5. CANCELLATION keeps `expiration_at_ms`; state = `cancelled_pending_expiration`; EXPIRATION only once the clock reaches `expiration_at_ms`.
6. BILLING_ISSUE sets `grace_period_expiration_at_ms` = now + grace (default P16D); RENEWAL recovers, EXPIRATION churns with `BILLING_ERROR` once the grace period is over.
7. Unique UUID `id`; `environment`/`store` as configured.
8. Illegal transitions throw before any payload exists; history length unchanged.
