# F3 — Scenarios

## File format (T-030)

```yaml
name: trial-billing-issue-recovers            # required, identifier-ish
description: Trial converts, first renewal fails, recovers within grace period   # optional
subscriber:                                   # optional block; every key optional
  app_user_id: auto                           # "auto" (default) → generated from the seed, or a fixed string
  product_id: com.example.premium.monthly     # default com.example.premium.monthly
  period: P1M                                 # ISO-8601, default P1M
  trial: P1W                                  # ISO-8601; omit → no trial (INITIAL_PURCHASE goes straight to active)
  grace_period: P16D                          # ISO-8601, default P16D (Apple's default billing retry window)
  store: app_store                            # only app_store in v0.1 (Icebox: others)
  environment: SANDBOX                        # SANDBOX | PRODUCTION
steps:                                        # required, non-empty
  - event: INITIAL_PURCHASE                   # one of the 7 event types
    set:                                      # optional field overrides on this payload (dot paths allowed)
      price: 9.99
    expect:                                   # optional per-step expectation
      response_status: 200
  - advance: P1W                              # move the virtual clock
expect:                                       # optional scenario-level expectations
  all_responses_status: 200
  max_response_ms: 500
```

Rules:
- Unknown keys anywhere → validation error (strict objects). Typos are the #1 scenario bug.
- A step is **exactly one** of `event` or `advance`. `set`/`expect` only accompany `event`.
- Durations are validated with `parseDuration` at load time.
- `name` matches `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`.

## Error reporting
`loadScenario(path)` throws `ScenarioValidationError` with `file`, `line`, `column`, `path` (dotted) and a human message:

```
✖ scenarios/x.yaml:7:5 — steps[1].advance: Invalid ISO-8601 duration: "1 week".
```
YAML syntax errors are reported the same way using the parser's position.

## Shipped examples (T-032)

| file | events | virtual span |
|------|--------|--------------|
| trial-converts | INITIAL_PURCHASE, RENEWAL, RENEWAL | P1W + P2M |
| trial-churns | INITIAL_PURCHASE, CANCELLATION, EXPIRATION | P1W |
| billing-issue-recovers | INITIAL_PURCHASE, RENEWAL, BILLING_ISSUE, RENEWAL | ≈ P1W + P1M + P3D |
| billing-issue-churns | INITIAL_PURCHASE, RENEWAL, BILLING_ISSUE, EXPIRATION | ≈ P1W + P1M + P16D |
| cancel-then-uncancel | INITIAL_PURCHASE, CANCELLATION, UNCANCELLATION, RENEWAL | P1M |
| happy-year | INITIAL_PURCHASE + 12 × RENEWAL (13) | P1Y |

## Engine (T-031)

`loadScenarioWithSource(file)` → `{ scenario, file, stepPositions[] }` (line/column of each step, for mid-run errors). `loadScenario(file)` stays as the plain `Scenario` accessor.

`runScenario(scenario, opts)`:
- `opts`: `{ to, authHeader?, speed: "instant" | number(ms between events), seed?, dryRun?, source?: {file, stepPositions}, onEvent?(result) }`.
- Creates `createSimulation(subscriber config, seed)`; walks steps in order: `advance` → clock; `event` → `subscriber.emit(type, set)` → envelope → `postEvent` (skipped in dry-run, `status: null`).
- Returns `RunResult`:
  ```ts
  { scenario: string; seed: string | number | null; startedAt: string; endedAt: string; virtualSpanMs: number;
    events: { step: number; type: EventType; virtualTime: string; status: number | null; latencyMs: number | null; event: Event }[];
    expectations: ExpectationResult[]; // T-040
    ok: boolean }                        // every delivered event 2xx and every expectation passed
  ```
- Failure modes (all `RccError`, exit 1): illegal transition / premature event → message prefixed with `step N (file:line)`; unreachable endpoint → the `send` message; scenario file errors → `ScenarioValidationError`.
- Determinism: same seed + same scenario ⇒ identical `events[].event` payloads.

## `rcc run <file>` output (T-031)

```
▶ trial-churns — Trial starts, user cancels during the trial, access ends at trial expiry
  #  event             virtual time              status  latency
  1  INITIAL_PURCHASE  2025-01-01T00:00:00.000Z  200     12 ms
  2  CANCELLATION      2025-01-03T00:00:00.000Z  200      4 ms
  3  EXPIRATION        2025-01-08T00:00:00.000Z  200      3 ms
✔ 3 events · 3 ok · 0 failed · virtual span 7d (2025-01-01 → 2025-01-08)
```
Flags: `--to` (default `http://localhost:3000/webhook`), `--auth-header`, `--speed instant|<ms>` (default instant), `--seed`, `--dry-run` (prints each envelope as JSON lines to stdout, table to stderr), `--json` (T-040).

## CI mode (T-040)
_See specs/F4-ci.md — TBD._
