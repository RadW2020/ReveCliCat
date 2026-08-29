# F4 — CI mode

## Expectations (T-040)

Evaluated after the run, from the scenario file:

| Where | Key | Meaning |
|-------|-----|---------|
| step (`event`) | `expect.response_status: <int>` | that event's HTTP status must equal the value |
| scenario | `expect.all_responses_status: <int>` | every event's status must equal the value |
| scenario | `expect.max_response_ms: <int>` | every event's latency must be ≤ the value |

Each check produces an `ExpectationResult { scope, step, rule, expected, actual, ok }`. `RunResult.ok` = every delivered event is 2xx **and** every expectation passed. In `--dry-run`, status/latency are `null`, so status/latency expectations are reported as `skipped` (ok=true, actual="skipped").

## Exit codes
- `0` — run completed, every expectation passed (or none defined), all deliveries 2xx.
- `1` — any failed expectation, any non-2xx delivery, transport error, illegal transition, scenario validation error.
- `2` — usage error (commander).

## Output
Human mode (default): the table, then one line per failed expectation:
```
✖ expectation failed · step 7 RENEWAL · response_status: expected 200, got 500
✖ expectation failed · scenario · max_response_ms: expected ≤ 200, got 340 (step 3 BILLING_ISSUE)
```
then the summary, which appends `· N/M expectations passed` when any are defined.

`--json`: **stdout is exactly one JSON document**, human output goes to stderr:
```json
{ "scenario": "trial-churns", "seed": 1, "startedAt": "...", "endedAt": "...", "virtualSpanMs": 604800000,
  "events": [ { "step": 0, "type": "INITIAL_PURCHASE", "virtualTime": "...", "status": 200, "latencyMs": 12, "event": { ... } } ],
  "expectations": [ { "scope": "scenario", "step": null, "rule": "all_responses_status", "expected": "200", "actual": "200", "ok": true } ],
  "ok": true }
```
`--json --dry-run` works (`status: null`, expectations skipped).

## Reference handler (T-041) — `examples/express-handler.ts`
Express app factory `createApp({ authHeader?, onEvent? })`: `POST /webhook` → 401 on `Authorization` mismatch (when configured), 400 on invalid envelope (schemas from `reveclicat`), 200 `{ ok: true, deduped: true }` on a repeated `event.id`, 200 `{ ok: true }` otherwise. `GET /health` → 200. Started with `npx tsx examples/express-handler.ts` (`PORT`, `RC_WEBHOOK_AUTH` env).

## GitHub Action (T-042) — `examples/github-action.yml`
Node 20 → `npm ci` → build → start the handler in the background → wait for `/health` → `rcc run` two scenarios with `--json` → job fails on exit 1.
