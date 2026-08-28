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
| cancelled_pending_expiration | EXPIRATION | expired |
| billing_issue | RENEWAL | active (recovery) |
| billing_issue | EXPIRATION | expired (churn) |
| billing_issue | CANCELLATION | cancelled_pending_expiration |
| expired | INITIAL_PURCHASE | active (resubscribe, no trial) |
| any | TEST | unchanged |

Anything else → `IllegalTransitionError` naming the current state, the attempted event and the legal events from that state. The transition function is pure: `transition(state, event, ctx) → nextState` with `ctx = { hasTrial, resumeState }`.

## Coherence rules (T-011)
_TBD in T-011._
