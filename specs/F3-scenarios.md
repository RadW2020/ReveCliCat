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

## Engine (T-031) & CI mode (T-040)
_See specs/F4-ci.md (T-040) — TBD._
