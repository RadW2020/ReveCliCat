# F2 — Commands

All commands share: actionable errors via `RccError` (exit 1), commander usage errors (exit 2), `--help` with defaults and an example. Shared flags keep identical names/semantics: `--to`, `--auth-header`, `--seed`, `--dry-run`, `--json` (where applicable).

Defaults may come from `reveclicat.config.json` in the cwd (T-051): `{ "to", "authHeader", "store", "environment" }`. Flags win over config, config wins over built-in defaults.

## `rcc send <EVENT_TYPE>` (T-020)

Send one schema-valid event.

| Flag | Default | Notes |
|------|---------|-------|
| `--to <url>` | `http://localhost:3000/webhook` | |
| `--store <store>` | `app_store` | v0.1: `app_store` only |
| `--user <app_user_id>` | generated `$RCAnonymousID:…` | |
| `--product <product_id>` | `com.example.premium.monthly` | |
| `--auth-header <value>` | — | sent verbatim as `Authorization` |
| `--environment <env>` | `SANDBOX` | `SANDBOX` \| `PRODUCTION` |
| `--set <key=value>` | — | repeatable; dot paths; value parsed as JSON when possible, else string |
| `--seed <seed>` | — | deterministic ids + fixed clock start (2025-01-01Z) |
| `--dry-run` | false | print the envelope, send nothing |

**Prelude.** A single event must still be coherent, so `send` silently runs the shortest legal history before the requested event and sends only the last one:

| Event | Prelude (period P1M, no trial) |
|-------|--------------------------------|
| TEST, INITIAL_PURCHASE | — |
| RENEWAL | INITIAL_PURCHASE · advance P1M |
| CANCELLATION | INITIAL_PURCHASE · advance P10D |
| UNCANCELLATION | INITIAL_PURCHASE · advance P10D · CANCELLATION · advance P1D |
| BILLING_ISSUE | INITIAL_PURCHASE · advance P1M |
| EXPIRATION | INITIAL_PURCHASE · advance P10D · CANCELLATION · advance P21D |

Unseeded, the clock is started in the past so the sent event's `event_timestamp_ms` ≈ now. Seeded, it starts at the fixed epoch.

**Output.** One line: `✔ RENEWAL → http://localhost:3000/webhook  200 OK  (12 ms)`; exit 0 on 2xx, else `✖ … 500` and exit 1. `--dry-run` prints the JSON envelope to stdout (pipeable).

**Errors.** Unknown type → lists the 7 types. Bad `--store`/`--environment` → allowed values. Invalid `--set` → zod path + hint. Connection refused → `Could not reach <url>. Is your server running? Try \`rcc listen\` to test locally.`

## `rcc listen` (T-021)

Local receiver.

| Flag | Default | Notes |
|------|---------|-------|
| `--port <n>` | `8787` | |
| `--forward <url>` | — | re-POST body + `Authorization`; reply with the forwarded status |
| `--auth-header <value>` | — | mismatching requests → red `AUTH MISMATCH`, 401 |
| `--verbose` | false | print full JSON payload |

Behaviour: `POST` on any path → log line `HH:MM:SS  RENEWAL        app_user_id  product_id  → 200`. Invalid body → `INVALID` (+ zod message), 400. Non-POST → 404 JSON. Prints `Listening on http://localhost:8787/webhook — send events with: rcc send INITIAL_PURCHASE --to http://localhost:8787/webhook`. `startListener(opts)` returns `{ url, port, close() }`.

## `rcc run <scenario.yaml>` (T-031, T-040)
See `specs/F3-scenarios.md` and `specs/F4-ci.md`.

## `rcc init` (T-051)
Creates `reveclicat.config.json` + `scenarios/` (6 examples) in cwd; refuses to overwrite unless `--force`.
