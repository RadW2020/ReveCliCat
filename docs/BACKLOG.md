# ReveCliCat — Backlog

Spec-driven board. Every ticket has an ID (`T-XXX`), a feature, a description and verifiable acceptance criteria. Commits reference their ticket (`feat(T-011): ...`).

**Common Definition of Done (applies to every ticket):**
- Tests derived from the acceptance criteria are green (written first, red before implementation).
- Full suite green (`npm test`), lint clean (`npm run lint`), typecheck clean (`npm run typecheck`).
- README / CHANGELOG updated if the ticket changes the CLI surface (commands, flags, YAML format).
- `docs/WORKLOG.md` entry written; ticket moved to **Done** in this file.
- Commit message `type(T-XXX): summary` (Conventional Commits, English).

Legend: 🧊 Icebox · 📋 Backlog · 🔨 In progress · ✅ Done · ⛔ Blocked

---

## Board

| ID | Title | Epic | Status |
|----|-------|------|--------|
| T-001 | Project scaffolding | E0 | ✅ |
| T-002 | Research official RevenueCat webhook docs → `docs/payload-sources.md` | E0 | ✅ |
| T-003 | Zod schemas for the 7 v0.1 event types + fixtures | E0 | ✅ |
| T-004 | Validate PROVISIONAL `TEST` schema against a real dashboard event | E0 | ⛔ |
| T-010 | State machine: states and transitions | E1 | ✅ |
| T-011 | The 8 coherence rules, one test each | E1 | ✅ |
| T-012 | Virtual clock (ISO-8601 durations, `--seed`) | E1 | ✅ |
| T-020 | `rcc send <EVENT_TYPE>` | E2 | ✅ |
| T-021 | `rcc listen` | E2 | ✅ |
| T-022 | Smoke e2e: `send` → `listen` integration test | E2 | ✅ |
| T-030 | Scenario YAML parser + schema | E3 | ✅ |
| T-031 | Scenario engine + `rcc run` | E3 | ✅ |
| T-032 | The 6 example scenarios | E3 | ✅ |
| T-040 | CI mode: `expect:` blocks, exit codes, `--json` | E4 | ✅ |
| T-041 | `examples/express-handler.ts` | E4 | 📋 |
| T-042 | `examples/github-action.yml` | E4 | 📋 |
| T-050 | README (English) | E5 | 📋 |
| T-051 | `rcc init`, LICENSE, CONTRIBUTING, CHANGELOG 0.1.0 | E5 | 📋 |
| T-052 | Final polish: errors, `--help`, flag consistency | E5 | 📋 |

---

## Epic 0 — Foundations & fidelity

### T-001 · Project scaffolding
**Feature:** F0 (overview). **Depends on:** —

Set up the TypeScript/ESM project: `tsup` build, `vitest`, ESLint, folder structure, `rcc` and `purr` binaries pointing at the same entry.

**Acceptance criteria**
- [ ] `package.json` name `reveclicat`, `"type": "module"`, `engines.node >= 20`, `bin: { rcc, purr }` both pointing to `dist/cli.js`.
- [ ] `npm run build` produces `dist/cli.js` (ESM, shebang) and `npm run typecheck`, `npm run lint`, `npm test` all pass on a fresh clone.
- [ ] Running `node dist/cli.js --version` prints the package version; `--help` lists the top-level commands.
- [ ] `tsconfig.json` is `strict: true` with `noUncheckedIndexedAccess`.
- [ ] Folder layout matches `specs/F0-overview.md` (`src/`, `src/commands/`, `src/core/`, `src/schemas/`, `test/`, `scenarios/`, `examples/`, `docs/`, `specs/`).
- [ ] A smoke test asserts the CLI module exports a `buildProgram()` whose name is `rcc`.

### T-002 · Research official RevenueCat webhook docs
**Feature:** F1 (payloads). **Depends on:** —

Read the official docs starting at `https://www.revenuecat.com/docs/integrations/webhooks`, navigate to event types/fields and sample events, and write `docs/payload-sources.md`.

**Acceptance criteria**
- [ ] `docs/payload-sources.md` lists every URL consulted with the consultation date.
- [ ] For each of the 7 v0.1 event types there is a row: source URL, date, status `VERIFIED` or `PROVISIONAL`.
- [ ] The envelope (`api_version`, `event`), the Authorization header semantics and the enumerations (`store`, `environment`, `period_type`, `cancel_reason`, `expiration_reason`) are documented with their source.
- [ ] If any page was unreachable, the affected schemas are marked `PROVISIONAL` and a high-priority ticket `T-00X` is added to this backlog to validate them.

### T-004 · Validate the PROVISIONAL `TEST` schema (high priority, needs a human)
**Feature:** F1 (payloads). **Depends on:** T-003. **Blocked:** requires a RevenueCat dashboard account to issue a test event.

The official docs describe `TEST` ("purchase-like sample payload", Common + Subscriber identity + Subscription lifecycle field groups) but publish no sample. Our schema is marked PROVISIONAL in `docs/payload-sources.md`.

**Acceptance criteria**
- [ ] A real `TEST` event captured with `rcc listen --verbose` is added to `test/fixtures/events/TEST.captured.json` (secrets redacted).
- [ ] `TestEventSchema` tightened to the observed shape; `docs/payload-sources.md` row flipped to `VERIFIED` with capture date.

### T-003 · Zod schemas for the 7 event types + fixtures
**Feature:** F1 (payloads). **Depends on:** T-002

`zod` schemas for `TEST`, `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`, `BILLING_ISSUE`, `EXPIRATION` plus the webhook envelope, with example fixtures and validation tests.

**Acceptance criteria**
- [ ] `src/schemas/` exports one schema per event type, a discriminated union `EventSchema` on `type`, and `WebhookEnvelopeSchema` (`{ api_version: string, event }`; we always emit `"1.0"`, but incoming validation must not hard-fail on a newer version — see payload-sources.md).
- [ ] Field names and enumerations match `docs/payload-sources.md` exactly (no invented fields).
- [ ] `test/fixtures/events/*.json` contains one valid fixture per event type; a test parses each against its schema and the union.
- [ ] Negative tests: wrong `type`, missing required field (`app_user_id`), invalid `store` value, non-integer `*_ms` timestamp → each rejects with a zod error naming the path.
- [ ] Event-specific fields are enforced: `CANCELLATION` requires `cancel_reason`; `EXPIRATION` requires `expiration_reason`; `RENEWAL` accepts `is_trial_conversion` (optional per docs; our generator always emits it); `BILLING_ISSUE` requires `grace_period_expiration_at_ms` (nullable).
- [ ] Schemas are non-strict (unknown keys pass through) and `Always`/`Sometimes` inclusion semantics follow `docs/payload-sources.md`.
- [ ] Type inference: `type Event = z.infer<typeof EventSchema>` is exported and used by the rest of the code.

---

## Epic 1 — State machine

### T-010 · States and transitions
**Feature:** F1 (state machine). **Depends on:** T-003

Pure, in-memory subscription state machine. States: `none`, `trial`, `active`, `cancelled_pending_expiration`, `billing_issue`, `expired`. Inputs are event types; illegal transitions throw.

**Acceptance criteria**
- [ ] `src/core/state-machine.ts` exports `SubscriptionState` union and `transition(state, eventType, ctx)` (or an equivalent class) returning the next state.
- [ ] Legal transitions (all tested):
  - `none` —`INITIAL_PURCHASE`→ `trial` (if product has trial) or `active` (otherwise)
  - `trial` —`RENEWAL`→ `active` (trial conversion) · `trial` —`CANCELLATION`→ `cancelled_pending_expiration` · `trial` —`BILLING_ISSUE`→ `billing_issue` · `trial` —`EXPIRATION`→ `expired`
  - `active` —`RENEWAL`→ `active` · `active` —`CANCELLATION`→ `cancelled_pending_expiration` · `active` —`BILLING_ISSUE`→ `billing_issue` · `active` —`EXPIRATION`→ `expired`
  - `cancelled_pending_expiration` —`UNCANCELLATION`→ previous state (`trial` or `active`) · `cancelled_pending_expiration` —`EXPIRATION`→ `expired`
  - `billing_issue` —`RENEWAL`→ `active` (recovery) · `billing_issue` —`EXPIRATION`→ `expired` · `billing_issue` —`CANCELLATION`→ `cancelled_pending_expiration`
  - `expired` —`INITIAL_PURCHASE`→ `active` (resubscribe, no trial)
  - `TEST` is legal from any state and does not change it.
- [ ] Illegal transitions (e.g. `none`→`RENEWAL`, `active`→`UNCANCELLATION`, `expired`→`RENEWAL`) throw `IllegalTransitionError` whose message names current state, attempted event and the list of legal events from that state.
- [ ] `legalEvents(state)` is exported and its output matches the table above.

### T-011 · The 8 coherence rules
**Feature:** F1 (state machine). **Depends on:** T-010, T-012

The `Subscriber` simulation produces full event payloads; each coherence rule has a dedicated test.

**Acceptance criteria** (one test per rule, named `rule N: ...`)
- [ ] R1: all events in a sequence share `app_user_id`, `original_transaction_id`, `product_id`; each `RENEWAL` has a new `transaction_id` and the same `original_transaction_id`.
- [ ] R2: `event_timestamp_ms` is monotonically non-decreasing across the sequence; `purchased_at_ms < expiration_at_ms`; `expiration_at_ms = purchased_at_ms + period` (or trial duration during trial). (`purchased_at_ms` may exceed `event_timestamp_ms` on early App Store renewals, per official docs — not forbidden.)
- [ ] R3: `period_type` is `TRIAL` while in trial, `NORMAL` after conversion.
- [ ] R4: a `RENEWAL` sets `expiration_at_ms` to previous `expiration_at_ms + period` (exactly one period).
- [ ] R5: `CANCELLATION` does not change `expiration_at_ms`; state becomes `cancelled_pending_expiration`; `EXPIRATION` is only legal once clock ≥ `expiration_at_ms` (otherwise `PrematureEventError` telling how far to advance).
- [ ] R6: `BILLING_ISSUE` sets `grace_period_expiration_at_ms = event_timestamp_ms + grace` (configurable, default `P16D`); from there `RENEWAL` recovers and `EXPIRATION` churns with `expiration_reason: BILLING_ERROR`.
- [ ] R7: every event has a unique UUID `id`, and `environment`/`store` equal the configured values.
- [ ] R8: an illegal transition throws before any payload is produced (the sequence length is unchanged after the failure).
- [ ] Every generated event validates against `EventSchema` (T-003).

### T-012 · Virtual clock
**Feature:** F1 (state machine). **Depends on:** T-001

Deterministic virtual clock: starts at a fixed epoch, advances by ISO-8601 durations, never goes backwards; deterministic IDs via `--seed`.

**Acceptance criteria**
- [ ] `parseDuration("P1M" | "P1W" | "P3D" | "PT1H" | "P1Y" | "P1M2DT3H")` returns a duration; invalid strings throw `InvalidDurationError` with the offending input in the message.
- [ ] `VirtualClock.advance(duration)` adds calendar-aware time (`P1M` from Jan 31 → Feb 28/29 clamp, UTC) and `now()` returns ms; advancing by a negative or zero duration throws.
- [ ] `createRng(seed)` returns a deterministic PRNG; `uuid()` from the same seed yields the same sequence of RFC-4122-shaped v4 UUIDs; different seeds yield different sequences; no seed → `crypto.randomUUID()`.
- [ ] Clock start defaults to a fixed instant when seeded (`2025-01-01T00:00:00Z`) and to `Date.now()` when unseeded.

---

## Epic 2 — Basic commands

### T-020 · `rcc send <EVENT_TYPE>`
**Feature:** F2 (commands). **Depends on:** T-011

Send a single, schema-valid event to an endpoint.

**Acceptance criteria**
- [ ] `rcc send INITIAL_PURCHASE` POSTs a valid envelope to `http://localhost:3000/webhook` with `Content-Type: application/json`.
- [ ] Flags: `--to <url>`, `--store <store>` (default `app_store`), `--user <app_user_id>` (default generated), `--auth-header <value>` (sent as `Authorization`), `--environment SANDBOX|PRODUCTION` (default `SANDBOX`), `--set key=value` (repeatable; dot-paths allowed, e.g. `--set price=9.99 --set subscriber_attributes.plan.value=pro`), `--dry-run` (print payload, do not send), `--seed <n>`.
- [ ] Unknown event type → exit 1 and message listing the 7 valid types.
- [ ] Invalid `--environment` or `--store` value → exit 1 with allowed values.
- [ ] `--set` producing a schema-invalid payload → exit 1 with the zod path and a hint.
- [ ] Connection refused → exit 1 with message "Could not reach <url>. Is your server running? Try `rcc listen` to test locally."
- [ ] Success prints one line: event type, target, HTTP status, latency ms; exit 0 on 2xx, exit 1 otherwise (status shown).

### T-021 · `rcc listen`
**Feature:** F2 (commands). **Depends on:** T-003

Local HTTP receiver that pretty-prints incoming webhook events.

**Acceptance criteria**
- [ ] `rcc listen` starts an HTTP server on port `8787` (`--port` overrides) and prints the listening URL.
- [ ] Each POST is logged as one line: time, event `type`, `app_user_id`, `product_id`; `--verbose` also prints the full JSON payload.
- [ ] Body that is not a valid envelope → still logged, marked as `INVALID` with the zod error, responds 400.
- [ ] `--auth-header <value>`: requests whose `Authorization` header differs are marked in red (`AUTH MISMATCH`) and answered 401; matching ones answered 200.
- [ ] `--forward <url>`: the raw body and `Authorization` header are forwarded via POST; the forwarded response status is shown; `listen` answers with the forwarded status.
- [ ] Non-POST or unknown path → 404 with a short JSON error.
- [ ] Exported `startListener(opts)` returns `{ url, close() }` so it is testable without spawning a process.

### T-022 · Smoke e2e: `send` → `listen`
**Feature:** F2 (commands). **Depends on:** T-020, T-021

**Acceptance criteria**
- [ ] Integration test builds the CLI, spawns `node dist/cli.js listen --port <free>` in one process and `node dist/cli.js send RENEWAL --to http://127.0.0.1:<port>/webhook` in another; asserts `send` exits 0 and `listen` stdout contains `RENEWAL`.
- [ ] Same with `--auth-header` mismatch: `send` exits 1 and reports 401; `listen` output contains `AUTH MISMATCH`.

---

## Epic 3 — Scenario engine

### T-030 · Scenario YAML parser + schema
**Feature:** F3 (scenarios). **Depends on:** T-012

**Acceptance criteria**
- [ ] `loadScenario(path)` parses YAML and validates with zod against the format in `specs/F3-scenarios.md`.
- [ ] Required: `name`, `steps` (non-empty). Optional: `description`, `subscriber` (`app_user_id: auto|string`, `product_id`, `period` ISO-8601, `trial` ISO-8601, `store`, `environment`, `grace_period`), `expect`.
- [ ] Each step is exactly one of `{ event: <TYPE>, set?: {...}, expect?: { response_status } }` or `{ advance: <ISO-8601> }`; anything else is a validation error.
- [ ] Validation errors report file path, **line and column** of the offending node (via the YAML CST) and the field path; unknown keys are rejected.
- [ ] Unknown event type in a step lists the valid ones; invalid duration string reports the value.
- [ ] Tests cover a valid scenario, each error class, and the line/column reporting.

### T-031 · Scenario engine + `rcc run`
**Feature:** F3 (scenarios). **Depends on:** T-030, T-011, T-020

**Acceptance criteria**
- [ ] `runScenario(scenario, opts)` executes steps sequentially: `advance` moves the virtual clock; `event` transitions the state machine, builds the payload, POSTs it, records `{ type, virtualTime, status, latencyMs }`.
- [ ] `rcc run <file>` flags: `--to` (default `http://localhost:3000/webhook`), `--auth-header`, `--speed instant|<ms>` (default `instant`; `<ms>` waits between events), `--seed`, `--dry-run` (prints payloads, no HTTP).
- [ ] Output: a table with columns `#`, `event`, `virtual time (ISO)`, `status`, `latency`; then a summary line `N events, M ok, K failed, virtual span <duration>`.
- [ ] An illegal transition inside a scenario stops the run with the state-machine error, the step index and the scenario file:line; exit 1.
- [ ] Unreachable endpoint → same actionable message as `send`; exit 1.
- [ ] Same `--seed` + same scenario → byte-identical payloads across two runs (test).

### T-032 · The 6 example scenarios
**Feature:** F3 (scenarios). **Depends on:** T-031

**Acceptance criteria**
- [ ] `scenarios/` contains `trial-converts.yaml`, `trial-churns.yaml`, `billing-issue-recovers.yaml`, `billing-issue-churns.yaml`, `cancel-then-uncancel.yaml`, `happy-year.yaml`, each with a clear `description`.
- [ ] `happy-year` produces 1 `INITIAL_PURCHASE` + 12 `RENEWAL` (13 events) spanning P1Y of virtual time.
- [ ] A test loads and runs every example in dry-run mode: all parse, all transitions legal, all payloads schema-valid, event counts match the table in `specs/F3-scenarios.md`.

---

## Epic 4 — CI mode

### T-040 · `expect:` blocks, exit codes, `--json`
**Feature:** F4 (CI). **Depends on:** T-031

**Acceptance criteria**
- [ ] Step-level `expect.response_status` and scenario-level `expect.all_responses_status`, `expect.max_response_ms` are evaluated after the run.
- [ ] Any failed expectation → exit code 1; all pass → exit 0; expectations absent → exit 0 unless transport error.
- [ ] Failed expectations are listed with step index, event type, expected vs actual.
- [ ] `--json` prints a single JSON document to stdout (`{ scenario, seed, events: [...], expectations: [...], ok }`) and nothing else on stdout (human output goes to stderr); a test parses it.
- [ ] `--json` + `--dry-run` works and reports `status: null`.

### T-041 · `examples/express-handler.ts`
**Feature:** F4 (CI). **Depends on:** T-003

**Acceptance criteria**
- [ ] Minimal Express handler: checks `Authorization` against `RC_WEBHOOK_AUTH` env (if set), validates the envelope with the published schemas, dedupes by `event.id` (in-memory `Set`), returns 200 on duplicate without reprocessing, 401 on bad auth, 400 on invalid body.
- [ ] Runs with `npx tsx examples/express-handler.ts` on `PORT` (default 3000), route `/webhook`.
- [ ] A test imports the app factory and exercises: valid event → 200, duplicate → 200 with `deduped: true`, bad auth → 401, garbage → 400.

### T-042 · `examples/github-action.yml`
**Feature:** F4 (CI). **Depends on:** T-040, T-041

**Acceptance criteria**
- [ ] Workflow: checkout, setup-node 20, `npm ci`, start `examples/express-handler.ts` in background, wait for port, run `rcc run scenarios/trial-churns.yaml --json` and `rcc run scenarios/billing-issue-recovers.yaml --json` against it; fails the job on exit 1.
- [ ] Valid YAML (test parses it and asserts both scenario invocations are present).
- [ ] Referenced from README's CI section.

---

## Epic 5 — Release readiness

### T-050 · README (English)
**Feature:** F0. **Depends on:** T-032, T-040

**Acceptance criteria**
- [ ] First line: non-affiliation disclaimer with RevenueCat, Inc.
- [ ] Sections: tagline, What it is, Why it exists, 60-second quickstart (`npm i -g reveclicat`, `rcc init`, `rcc run scenarios/trial-churns.yaml`), commands table, scenario YAML format, CI section (links to `examples/`), `<!-- TODO: demo GIF -->`, authorization note (RevenueCat uses a plain Authorization header, no payload signing), state diagram, license.
- [ ] Every command/flag in README exists in `--help` (test greps README for each flag name).

### T-051 · `rcc init`, LICENSE, CONTRIBUTING, CHANGELOG
**Feature:** F2. **Depends on:** T-032

**Acceptance criteria**
- [ ] `rcc init` creates `reveclicat.config.json` (`{ to, authHeader?, store, environment }` defaults) and `scenarios/` with the 6 examples in the cwd; refuses to overwrite existing files unless `--force`; prints what it created and the next command to try.
- [ ] `send`/`run` read defaults from `reveclicat.config.json` if present (flags win).
- [ ] `LICENSE` (MIT), `CONTRIBUTING.md` (how to run tests, ticket workflow, ADRs), `CHANGELOG.md` with `0.1.0` listing the features.

### T-052 · Final polish
**Feature:** F2. **Depends on:** all above

**Acceptance criteria**
- [ ] `rcc --help` and every subcommand `--help` show description, all flags with defaults, and one example.
- [ ] Shared flags (`--to`, `--auth-header`, `--seed`, `--dry-run`, `--json` where applicable) have identical names/semantics across `send` and `run`.
- [ ] Every user-facing error goes through one formatter: red `✖`, what failed, what to try; no stack traces unless `RCC_DEBUG=1`.
- [ ] Snapshot test of `--help` outputs.

---

## In progress

_(none)_

## Done

- T-001
- T-002
- T-003
- T-010
- T-011
- T-020
- T-021
- T-022
- T-012
- T-030
- T-031
- T-032
- T-040

## Icebox

Not for v0.1. Each line has its justification.

- Google Play / Stripe / Amazon / Roku stores — v0.1 proves the model with `app_store`; other stores add store-specific fields we have not verified.
- Integrated tunnel (ngrok-like) — main use case is local generation; no tunnel needed.
- Web UI — CLI is the product; a UI would dilute focus.
- Hosted mode — no infra in v0.1.
- Real npm publish — release readiness is in scope, publishing is a human decision.
- Cryptographic payload signing — RevenueCat uses a plain Authorization header; documented in README instead. (RevenueCat's opt-in HMAC header `X-RevenueCat-Webhook-Signature` could be a v0.2 flag.)
- Refund / early-expiration flows (`CUSTOMER_SUPPORT`, `DEVELOPER_INITIATED`, `PRICE_INCREASE`) — v0.1 time-guards EXPIRATION; refunds need their own semantics (negative prices).
