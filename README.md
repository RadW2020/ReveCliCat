> **Unofficial project — not affiliated with RevenueCat, Inc.**, nor endorsed or supported by it. "RevenueCat" is a trademark of RevenueCat, Inc. ReveCliCat generates *synthetic* webhook events for testing; it never talks to RevenueCat's servers.

# ReveCliCat 🐱 `rcc`

**Deterministic time travel for subscriptions: simulate a year of a subscriber's life in 30 seconds, locally and in CI, without touching Apple's sandbox.**

ReveCliCat is a small TypeScript CLI that generates RevenueCat-shaped webhook events, chains them through a subscription state machine so they stay coherent (same IDs, forward-moving timestamps, fields that mutate the way they really do), and POSTs them to your endpoint — `localhost` included, no tunnel needed. Think of it as the Stripe CLI that RevenueCat does not have.

<!-- TODO: demo GIF -->

```
$ rcc run scenarios/billing-issue-recovers.yaml
▶ billing-issue-recovers — Trial converts, the first renewal charge fails, and payment recovers within the grace period
#  event             virtual time              status  latency
1  INITIAL_PURCHASE  2025-01-01T00:00:00.000Z  200     26 ms
2  RENEWAL           2025-01-08T00:00:00.000Z  200     3 ms
3  BILLING_ISSUE     2025-02-08T00:00:00.000Z  200     2 ms
4  RENEWAL           2025-02-11T00:00:00.000Z  200     1 ms
✔ 4 events · 4 ok · 0 failed · virtual span 41d (2025-01-01 → 2025-02-11) · 2/2 expectations passed
```

## What it is

- **`rcc send <EVENT_TYPE>`** — fire one schema-valid event (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`, `BILLING_ISSUE`, `EXPIRATION`, `TEST`) at any URL.
- **`rcc run <scenario.yaml>`** — play a whole subscriber lifecycle from a YAML file on a **virtual clock** (`advance: P1M`), with per-event expectations and a CI-friendly exit code / `--json` output.
- **`rcc listen`** — a local receiver that validates incoming events against the schemas and pretty-prints them (handy to see what your own server will get).
- **`rcc init`** — drop a config file and six ready-made scenarios into your project.

The binary is `rcc`; `purr` is an alias for the same binary. Payload schemas are derived from RevenueCat's official webhook documentation — every field and enum is traced in [`docs/payload-sources.md`](docs/payload-sources.md).

## Why it exists

Testing RevenueCat webhooks today means either making real sandbox purchases (slow, flaky, tied to a device) or firing isolated events from the dashboard (no coherence between events). Neither lets you reproduce *"trial → charge fails → grace period → recovers → renews"* on your laptop, and neither fits in a CI pipeline.

ReveCliCat generates the events itself, so:

- **Coherence is guaranteed** — a state machine rejects impossible sequences (`RENEWAL` before `INITIAL_PURCHASE`, `EXPIRATION` before the period ends) and keeps `app_user_id`, `original_transaction_id`, `expiration_at_ms`, `period_type`… consistent across the sequence.
- **Time is simulated** — `advance: P1Y` costs nothing; a year of renewals takes milliseconds.
- **It is deterministic** — `--seed 42` gives byte-identical payloads on every run.
- **It runs anywhere** — `localhost`, Docker, GitHub Actions. No tunnel, no dashboard, no App Store.

## Quickstart (60 seconds)

```bash
npm i -g reveclicat            # installs `rcc` (and `purr`)
cd my-backend
rcc init                       # → reveclicat.config.json + scenarios/*.yaml
rcc listen                     # terminal 1: a local receiver on http://localhost:8787/webhook
rcc run scenarios/trial-churns.yaml --to http://localhost:8787/webhook   # terminal 2
```

Point it at your real handler instead (`--to http://localhost:3000/webhook`, or set `to` in `reveclicat.config.json`) and you are testing your code, not ours. Requires Node.js ≥ 20.

## Commands

| Command | What it does | Key flags |
|---------|--------------|-----------|
| `rcc send <EVENT_TYPE>` | POST one event. Runs the shortest legal history first (e.g. a purchase before a `RENEWAL`) and sends only the requested event. | `--to`, `--auth-header`, `--user`, `--product`, `--store`, `--environment`, `--set key=value` (repeatable, dot paths), `--seed`, `--dry-run` |
| `rcc run <scenario.yaml>` | Execute a scenario on a virtual clock and deliver every event. Exit 1 on any non-2xx or failed `expect`. | `--to`, `--auth-header`, `--speed instant\|<ms>`, `--seed`, `--dry-run`, `--json` |
| `rcc listen` | Local HTTP receiver: validates envelopes, checks the auth header, pretty-prints, optionally forwards. | `--port` (8787), `--auth-header`, `--forward <url>`, `--verbose` |
| `rcc init` | Create `reveclicat.config.json` and `scenarios/` with the six examples. | `--force` |
| `rcc tail` | Receive **real** RevenueCat webhooks on your machine through a relay and forward them to a local URL. | `--smee [url]`, `--forward <url>`, `--verbose` |

Every command has `--help` with defaults and examples. Set `NO_COLOR=1` to disable colours; `RCC_DEBUG=1` prints stack traces.

```bash
rcc send RENEWAL --to http://localhost:3000/webhook --auth-header "Bearer dev"
rcc send CANCELLATION --set cancel_reason=BILLING_ERROR --dry-run | jq .event
rcc run scenarios/happy-year.yaml --speed 250      # 13 events, one virtual year, a pause between each
rcc run scenarios/trial-churns.yaml --json > out.json
```

### Config file

`rcc init` writes `reveclicat.config.json`; `send` and `run` read it from the current directory. Precedence: **flag > config > built-in default**.

```json
{ "to": "http://localhost:3000/webhook", "authHeader": "Bearer dev", "store": "app_store", "environment": "SANDBOX" }
```

## Scenario format

```yaml
name: trial-billing-issue-recovers
description: Trial converts, first renewal fails, recovers within grace period
subscriber:                          # all optional
  app_user_id: auto                  # "auto" → $RCAnonymousID:… derived from the seed, or a fixed string
  product_id: com.example.premium.monthly
  period: P1M                        # ISO-8601 duration
  trial: P1W                         # omit → no trial
  grace_period: P16D                 # billing-retry window after BILLING_ISSUE
  store: app_store                   # v0.1: app_store only
  environment: SANDBOX               # SANDBOX | PRODUCTION
steps:
  - event: INITIAL_PURCHASE          # starts the trial (period_type: TRIAL, price 0)
  - advance: P1W
  - event: RENEWAL                   # trial → paid (is_trial_conversion: true)
  - advance: P1M
  - event: BILLING_ISSUE             # opens the grace period
  - advance: P3D
  - event: RENEWAL                   # recovery
    set:                             # optional overrides, dot paths allowed
      price: 4.99
    expect:
      response_status: 200
expect:
  all_responses_status: 200
  max_response_ms: 500
```

Rules: a step is exactly one of `event` or `advance`; unknown keys are errors; validation errors point at `file:line:column`. Illegal transitions stop the run with the step number and the list of legal events. `EXPIRATION` is only allowed once the virtual clock has reached `expiration_at_ms` (or the end of the grace period) — the error tells you exactly how much to `advance`.

Shipped examples (`rcc init` copies them): `trial-converts`, `trial-churns`, `billing-issue-recovers`, `billing-issue-churns`, `cancel-then-uncancel`, `happy-year` (12 renewals).

## CI

`rcc run … --json` prints one JSON document on stdout (`{ scenario, seed, events[], expectations[], ok }`) and exits **1** when any delivery is non-2xx or any `expect` fails — that is all a pipeline needs.

- [`examples/github-action.yml`](examples/github-action.yml) — a GitHub Actions job that starts a handler, waits for it, and runs two scenarios against it.
- [`examples/express-handler.ts`](examples/express-handler.ts) — a minimal, idempotent Express handler: checks the `Authorization` header, validates the envelope with the published schemas, dedupes by `event.id`, answers 200 fast. Run it with `PORT=3000 RC_WEBHOOK_AUTH="Bearer dev" npx tsx examples/express-handler.ts`.

## Receive real webhooks (`rcc tail`)

Everything above generates synthetic events. When you want the *real* thing — the dashboard's test event, a sandbox purchase — RevenueCat needs a public HTTPS URL, and your laptop is not one. `rcc tail` gives you one through a relay and streams the events back:

```bash
rcc tail --smee --forward http://localhost:3000/webhook
# ● Tailing https://smee.io/AbCdEf123456
#   Paste this URL in RevenueCat → Integrations → Webhooks: https://smee.io/AbCdEf123456
# 10:42:07  real  TEST              $RCAnonymousID:…  com.example.premium.monthly  → 200 (14 ms)
```

- `--smee` uses [smee.io](https://smee.io) (GitHub's public webhook relay): zero setup, no account. It keeps **no history** — events only arrive while `rcc tail` is running — and payloads transit a third-party service, so use it for development, not production. Pass an existing channel (`--smee https://smee.io/…`) to keep the URL you already configured in the dashboard.
- Each event is validated against the schemas (`INVALID` lines tell you what is off), printed in the same format as `rcc listen`, and, with `--forward`, re-POSTed to your local handler with the original `Authorization` header — the same workflow as the Stripe CLI's `listen` command forwarding to localhost.
- A self-hosted, persistent alternative (`rcc inbox`) is planned for v0.2 — see `specs/F6-inbox.md`.

## Authorization

RevenueCat authenticates webhooks with a **plain, static `Authorization` header** whose value you choose in the dashboard — there is no payload signature to verify. ReveCliCat mirrors that: `--auth-header "Bearer dev"` is sent verbatim, and `rcc listen --auth-header …` flags mismatches in red and answers 401. Your handler should compare the header with a constant-time equality check and treat anything else as unauthorized. (RevenueCat also offers an *opt-in* HMAC header, `X-RevenueCat-Webhook-Signature`; it is out of scope for v0.1.)

## State machine

```
none ──INITIAL_PURCHASE──▶ trial ──RENEWAL (conversion)──▶ active ◀─┐
  │                          │                               │  │   │ RENEWAL
  └──INITIAL_PURCHASE (no trial)─────────────────────────────┘  │   │
                             │  CANCELLATION / BILLING_ISSUE / EXPIRATION (same from active)
                             ▼
       cancelled_pending_expiration ──UNCANCELLATION──▶ back to trial | active
                 │ EXPIRATION                    billing_issue ──RENEWAL (recovery)──▶ active
                 ▼                                     │ EXPIRATION (BILLING_ERROR) / CANCELLATION
               expired ◀───────────────────────────────┘
                 │ INITIAL_PURCHASE (resubscribe, no trial)
                 └──────────────────────────────────────▶ active
```

`TEST` is legal from any state and changes nothing. Full tables: [`specs/F1-state-machine.md`](specs/F1-state-machine.md).

## Fidelity & scope

- Schemas, enums and inclusion rules come from the official docs (fetched 2026-08-29) and the official sample payloads are used as test fixtures. The `TEST` event has no published sample, so its schema is marked *provisional* — a captured real one is very welcome (see `docs/BACKLOG.md`, T-004).
- v0.1 models the **App Store** only. Google Play, Stripe, Amazon and Roku stores, a built-in tunnel, a web UI and hosted mode are intentionally out of scope (see the Icebox in `docs/BACKLOG.md`).
- Programmatic use: `import { runScenario, Subscriber, WebhookEnvelopeSchema } from "reveclicat"`.

## Contributing

Spec-driven, tests-first, one ticket per commit — see [`CONTRIBUTING.md`](CONTRIBUTING.md), the backlog in `docs/BACKLOG.md` and the decision log in `docs/adr/`.

## License

MIT © 2026 RadW2020. Not affiliated with RevenueCat, Inc.
