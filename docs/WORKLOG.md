# ReveCliCat — Worklog

Diary of work sessions. Newest at the bottom. Format: date · ticket · what was done · test result · notes.

---

## 2026-08-29 · Bootstrap
- Created traceability structure: `docs/BACKLOG.md` (18 tickets expanded with acceptance criteria), `specs/F0-overview.md`, `docs/adr/`, `docs/payload-sources.md` (skeleton), this worklog.
- Launched research of official RevenueCat webhook docs in parallel (T-002) so schema work is not blocked on it.
- Tests: n/a (no code yet).

## 2026-08-29 · T-001 · Project scaffolding
- Test first: `test/unit/program.test.ts` (program named `rcc`, semver version, four subcommands registered) — red, then green.
- Added `package.json` (`reveclicat`, bins `rcc`/`purr` → `dist/cli.js`, node ≥ 20, ESM), strict `tsconfig`, `tsup`, `vitest`, type-aware ESLint (ADR-001), `src/` layout per F0, `RccError` + `formatError`, no-dep ANSI colours.
- Versions pulled: commander 15, zod 4, TypeScript 6, vitest 4. TS 6 deprecates `baseUrl` that tsup's dts step injects → `ignoreDeprecations: "6.0"`.
- Gates: typecheck ✓ · lint ✓ · tests 2/2 ✓ · `node dist/cli.js --version` → `0.1.0`, `--help` lists send/listen/run/init.

## 2026-08-29 · T-012 · Virtual clock + seeded RNG
- Taken out of order (T-002 waits on doc research; T-012 only depends on T-001).
- Spec: `specs/F1-state-machine.md` (clock & randomness sections). Tests first: `clock.test.ts` (14 cases: ISO-8601 parsing incl. rejects, calendar-aware month clamping Jan 31→Feb 28/29, forward-only clock, seeded epoch) and `rng.test.ts` (determinism, string seeds via FNV-1a, v4-shaped UUIDs).
- Impl: `src/core/clock.ts` (`parseDuration`, `formatDuration`, `addDuration`, `VirtualClock`, `SEEDED_EPOCH_MS = 2025-01-01Z`), `src/core/rng.ts` (mulberry32, `createRng().uuid()`; unseeded falls back to `crypto.randomUUID`).
- Gates: typecheck ✓ · lint ✓ · tests 16/16 ✓.

## 2026-08-29 · T-030 · Scenario YAML parser + schema
- Taken while T-002 research ran (depends only on T-012). Spec written first: `specs/F3-scenarios.md` (format, strict keys, exactly-one-of step rule, error format, table of shipped examples).
- ADR-002: runtime dep `yaml` (eemeli) — needed for node ranges → line/column in validation errors; `js-yaml` cannot do that.
- Tests first (13): valid full/minimal scenarios with defaults, unknown keys, unknown event type (lists valid ones), bad durations, both/neither `event`/`advance`, empty steps, missing name, bad store/environment/period, bad expectations, YAML syntax errors, file path in message, missing file hint.
- Impl: `src/core/scenario.ts` (`ScenarioSchema` zod strictObjects, `parseScenario`, `loadScenario`, `ScenarioValidationError{file,line,column,path}`; zod issue path → YAML node via `doc.getIn(path, true)` + `LineCounter`), `src/schemas/common.ts` (EVENT_TYPES, ENVIRONMENTS, CLI_STORES).
- Gates: typecheck ✓ · lint ✓ · tests 29/29 ✓.

## 2026-08-29 · T-002 · Official RevenueCat webhook docs research
- Ran as a background research task while T-012/T-030 were built. All 4 official webhook pages (+ their canonical `.md` variants and `llms.txt`) fetched OK on 2026-08-29; only a dashboard screenshot 404'd.
- Wrote `docs/payload-sources.md` (sources table, per-schema VERIFIED/PROVISIONAL status, envelope/auth/retry facts, inclusion semantics Always/Sometimes, field groups, enums, flow facts). Raw notes with verbatim quotes and the 6 official sample payloads kept in `docs/research/revenuecat-webhooks-2026-08-29.md`.
- Key facts: Authorization is a static dashboard-configured header (no signature); new fields/types may appear without an `api_version` bump → schemas must be non-strict; Doubles may be serialised as ints.
- `TEST` has no official sample → schema will be PROVISIONAL; opened **T-004** (blocked: needs a human with a dashboard account). Refined T-003 criteria accordingly (spec before code).
- Tests: n/a (docs only); suite still 29/29.

## 2026-08-29 · T-003 · Zod schemas for the 7 event types + fixtures
- Fixtures: the 6 official samples copied byte-for-byte from the docs into `test/fixtures/events/` (+ the S2 envelope example). `TEST.json` constructed from documented field groups, marked PROVISIONAL in `test/fixtures/events/README.md`.
- Tests first (22): every fixture parses via per-type schema, `EventSchema` union and `WebhookEnvelopeSchema`; passthrough of unknown keys; `api_version` newer string OK / number rejected; negative paths (`type`, `app_user_id`, `store`, `*_ms`, enums); event-specific rules (cancel_reason, expiration_reason incl. SUBSCRIPTION_PAUSED only on EXPIRATION, is_trial_conversion optional boolean, grace_period_expiration_at_ms required-nullable, `{}` subscriber_attributes, optional app_id, TEST tolerance).
- Impl: `src/schemas/common.ts` (all enums from the docs), `src/schemas/events.ts` (`looseObject` bases: common / identity / lifecycle groups; per-type `extend`; discriminated union; envelope). Public API re-exported from `src/index.ts`.
- ESLint: allow `_`-prefixed rest-sibling destructuring (`ignoreRestSiblings`).
- Gates: typecheck ✓ · lint ✓ · tests 51/51 ✓.

### Epic 0 summary — Foundations & fidelity
**What works:** a strict TS/ESM CLI skeleton (`rcc`/`purr`), quality gates wired, and — the important part — event schemas grounded in the live official docs with the official samples as fixtures. Also, out of order because they were unblocked: the virtual clock/RNG (T-012) and the scenario parser (T-030).
**Debt:** `TEST` schema PROVISIONAL (T-004, needs a human with a dashboard). No smoke demo yet beyond `rcc --help` (no commands implemented).
**Next:** Epic 1 — state machine (T-010) and the 8 coherence rules (T-011).

## 2026-08-29 · T-010 · State machine: states and transitions
- Spec: transition table + ASCII diagram added to `specs/F1-state-machine.md`.
- Tests first (33): all 17 legal edges (incl. trial/no-trial INITIAL_PURCHASE, UNCANCELLATION resuming trial or active), 12 illegal edges, error contents, `legalEvents` table, and an exhaustive consistency check (`legalEvents` ⇔ `transition` for every state×event).
- Impl: `src/core/state-machine.ts` — pure `transition(state, event, ctx)` over a declarative table, `legalEvents`, `IllegalTransitionError{state,event,legal}` whose message lists the legal events.
- Gates: typecheck ✓ · lint ✓ · tests 84/84 ✓.

## 2026-08-29 · T-011 · The 8 coherence rules — `Subscriber`
- Spec first: field-derivation table per event added to `specs/F1-state-machine.md`; R2 criterion refined per official docs (App Store may bill up to 24 h before the period start, so `purchased_at_ms` may exceed `event_timestamp_ms` on early renewals — not forbidden).
- Tests first (16): one per rule (R1–R8, plus 3b/6b variants) over a trial→convert→renew→billing-issue→recover sequence, schema validity of every generated event, TEST from `none`, dot-path overrides + invalid override rejection, fixed vs auto `app_user_id` (`$RCAnonymousID:<32hex>`), seed determinism, resubscribe after expiry.
- Impl: `src/core/subscriber.ts` (`Subscriber.emit(type, overrides)`: transition → time guard (`PrematureEventError` with the exact `advance:` to add) → draft period → payload → zod validate → commit), `src/core/set-path.ts` (`setPath`/`applyOverrides`).
- Design note: non-purchase events carry `price: 0` (matches all official samples); renewals start at the previous `expiration_at_ms` (billing-period continuity, also during grace recovery).
- Gates: typecheck ✓ · lint ✓ · tests 100/100 ✓.

### Epic 1 summary — State machine
**What works:** a pure transition table (`state-machine.ts`), a forward-only calendar-aware virtual clock with seeded RNG, and `Subscriber`, which turns event types into schema-valid, mutually coherent payloads. Same seed ⇒ byte-identical sequences.
**Smoke demo:** no CLI command yet exercises this (Epic 2 next), so the "real terminal" demo is deferred to the Epic 2 milestone; the unit sequence in `subscriber.test.ts` (`lifecycle()`) is the equivalent today.
**Debt:** EXPIRATION is always time-guarded — refund-style early expirations (`CUSTOMER_SUPPORT`) are not modelled (Icebox candidate, noted below). `app_id` is synthetic.
**Next:** Epic 2 — `rcc send` (T-020), `rcc listen` (T-021), smoke e2e (T-022).

## 2026-08-29 · T-020 · `rcc send <EVENT_TYPE>`
- Spec: `specs/F2-commands.md` (all commands' flags; the **prelude** table — `send RENEWAL` alone would be an illegal transition, so `send` runs the shortest legal history and posts only the requested event; unseeded clocks start in the past so the event lands ≈ now).
- Tests first (12, in-process against a capture server; `test/helpers/server.ts`): envelope/headers, every type sendable alone, near-now timestamps, all flags incl. repeatable `--set` with dot paths, `--dry-run`, seed determinism, unknown type / bad env / bad store messages, invalid `--set`, connection refused, non-2xx → exit 1, `parseSetFlag` JSON-or-string.
- Impl: `buildProgram(io)` now takes injectable stdout/stderr; `src/core/io.ts`, `src/core/http.ts` (`postEvent` via fetch, latency, `unreachableError`, `assertUrl`), `src/core/engine.ts` (`createSimulation`, `applyStep`, `spanOf`, `preludeFor` — reused by `run`), `src/commands/send.ts`.
- Terminal check: `rcc send --help`, `rcc send RENEWAL --dry-run --seed 1`, unreachable target → actionable error, exit 1.
- Gates: typecheck ✓ · lint ✓ · tests 112/112 ✓.

## 2026-08-29 · T-021 · `rcc listen`
- Tests first (8, in-process via `startListener({port:0})`): URL banner + one-line log (time, type, app_user_id, product_id), `--verbose` full JSON, INVALID envelope/garbage → 400 with reasons (up to 3 zod paths), `--auth-header` mismatch → red `AUTH MISMATCH` + 401 / match → 200, `--forward` relays body + Authorization and the upstream status, unreachable upstream → 502 `forward failed`, non-POST → 404 JSON, port in use → actionable error.
- Impl: `src/commands/listen.ts` — `node:http` server, `startListener()` returns `{url, port, close}`; SIGINT/SIGTERM close the server.
- Terminal smoke: `rcc listen --port 8799 --auth-header "Bearer dev"` + `rcc send RENEWAL … --auth-header "Bearer dev"` → 200 / `rcc send TEST` without auth → `AUTH MISMATCH`, 401, send exit 1. Screens as designed.
- Gates: typecheck ✓ · lint ✓ · tests 120/120 ✓.

## 2026-08-29 · T-022 · Smoke e2e `send` → `listen`
- `test/integration/send-listen.e2e.test.ts`: builds `dist/cli.js` (tsup) in `beforeAll`, spawns `rcc listen --port <free> --auth-header "Bearer dev"` and, in separate processes, `rcc send RENEWAL` (exit 0, both sides show 200/RENEWAL) and `rcc send CANCELLATION --auth-header "Bearer wrong"` (exit 1 with 401; listener prints `AUTH MISMATCH`). `NO_COLOR=1` for stable assertions.
- Passed first run — the units had already exercised both sides; this pins the real process boundary.
- Gates: typecheck ✓ · lint ✓ · tests 122/122 ✓ (2 integration).

### Epic 2 summary — Basic commands
**What works (real terminal):** `rcc listen` receives, validates against the official schemas, checks `Authorization`, forwards; `rcc send <TYPE>` posts any of the 7 events coherently (prelude), with overrides, dry-run and seeds. Errors are actionable (unreachable target, unknown type, bad flags, non-2xx).
**Smoke demo:** `rcc listen --port 8799 --auth-header "Bearer dev"` ⟷ `rcc send RENEWAL … --auth-header "Bearer dev"` → 200; without auth → 401 / `AUTH MISMATCH` (see T-021 entry).
**Debt:** `listen` keeps the process alive with a never-resolving promise (fine for a CLI, not for embedding — `startListener` is the embeddable API). No config-file defaults yet (T-051).
**Next:** Epic 3 — scenario engine + `rcc run` (T-031; parser T-030 already done), example scenarios (T-032).

## 2026-08-29 · T-031 · Scenario engine + `rcc run`
- Spec: engine contract (`RunResult`, failure modes) and the `rcc run` output format added to `specs/F3-scenarios.md`.
- Tests first (15): `engine.test.ts` (step walk with virtual times, dry-run `status: null`, seed determinism, non-2xx recorded without aborting, illegal transition → `step N (file:line)`, premature EXPIRATION hint, unreachable endpoint, `--speed` pauses, subscriber config + `set:` overrides) and `run-command.test.ts` (table/summary/exit codes, dry-run JSON lines on stdout + table on stderr, `--auth-header`, file:line errors, invalid `--speed`).
- Impl: `parseScenarioWithSource`/`loadScenarioWithSource` (step positions), `runScenario()` in `src/core/engine.ts`, `src/core/output.ts` (padded table with post-padding colour, summary), `src/commands/run.ts`. Public API widened in `src/index.ts`.
- Terminal smoke: `rcc listen --port 8798` ⟷ `rcc run demo.yaml --seed 7` → 4/4 events 200, `virtual span 41d (2025-01-01 → 2025-02-11)`; illegal step → `step 2 (file:4): Illegal transition …`, exit 1.
- Gates: typecheck ✓ · lint ✓ · tests 137/137 ✓.

## 2026-08-29 · T-032 · The 6 example scenarios
- Tests first (`examples.test.ts`, 9): exactly six files ship; each parses, has a real description, runs legally in dry-run with every payload schema-valid and the documented event sequence; `happy-year` = 13 events over exactly one virtual year (2025-01-01 → 2026-01-01, last expiration 2026-02-01); churn reasons (`BILLING_ERROR` vs `UNSUBSCRIBE`, trial expiration keeps `period_type: TRIAL`).
- Files: `scenarios/{trial-converts,trial-churns,billing-issue-recovers,billing-issue-churns,cancel-then-uncancel,happy-year}.yaml`, commented step by step, all with `expect.all_responses_status: 200` (evaluated in T-040).
- Terminal: `rcc run scenarios/happy-year.yaml --dry-run --seed 3` → 13 events, `virtual span 365d`.
- Gates: typecheck ✓ · lint ✓ · tests 146/146 ✓.

### Epic 3 summary — Scenario engine
**What works:** YAML scenarios with strict validation and line/column errors; `rcc run` walks them against a virtual clock, delivers coherent events over real HTTP, prints a table + summary, exits 1 on any non-2xx, and is byte-reproducible with `--seed`. Six curated scenarios cover trial conversion/churn, billing-issue recovery/churn, cancel/uncancel and a full year.
**Smoke demo:** `rcc listen --port 8798` ⟷ `rcc run demo.yaml --seed 7` (4/4 → 200); `rcc run scenarios/happy-year.yaml --dry-run` (13 events, 365d).
**Debt:** `expect:` blocks are parsed but not yet evaluated (T-040, next). Span is shown in days only.
**Next:** Epic 4 — CI mode (T-040), reference Express handler (T-041), GitHub Action example (T-042).

## 2026-08-29 · T-040 · CI mode: `expect:` blocks, exit codes, `--json`
- Spec: `specs/F4-ci.md` (expectation semantics incl. dry-run "skipped", exit codes, JSON document shape, T-041/T-042 contracts).
- Tests first (9): pure `evaluateExpectations` (step + scenario rules, offending-step reporting for `all_responses_status`/`max_response_ms`, none defined, dry-run skipped); `rcc run` exit codes with per-failure lines and `N/M expectations passed`; `--json` = exactly one document on stdout with human output on stderr; `--json --dry-run`; transport error under `--json` leaves stdout empty.
- Impl: `evaluateExpectations()` + `RunResult.ok` now includes expectations (`engine.ts`), `renderFailedExpectations` + summary suffix (`output.ts`), `--json` flag (`run.ts`).
- Housekeeping: CHANGELOG `[Unreleased]` caught up with the CLI surface added by T-020/021/030/031/032/040 (art. 10 — should have been per ticket; from here on it is).
- Terminal: `rcc run scenarios/trial-churns.yaml --json --dry-run | node -e …` parses: 3 events, 1 expectation, ok=true.
- Gates: typecheck ✓ · lint ✓ · tests 155/155 ✓.

## 2026-08-29 · T-041 · `examples/express-handler.ts`
- ADR-003: `express` + `@types/express` as dev-only deps. The example imports from `"reveclicat"` like a user would; inside the repo that resolves to `src/index.ts` via `tsconfig.paths` + a vitest alias.
- Tests first (5): valid event → 200 `{ok:true}`, retry with same `event.id` → 200 `{ok:true, deduped:true}` and `onEvent` called once, wrong/missing auth → 401, garbage / invalid envelope → 400 with issues, `GET /health`, works with no auth configured.
- Impl: `createApp({ authHeader?, onEvent? })` — raw-text body so JSON errors are 400s, in-memory `Set` dedupe (comment points to Redis/DB for prod), respond-then-process. Runs standalone with `npx tsx examples/express-handler.ts` (`PORT`, `RC_WEBHOOK_AUTH`).
- Terminal: `PORT=3007 RC_WEBHOOK_AUTH="Bearer dev" npx tsx examples/express-handler.ts` ⟷ `rcc run scenarios/billing-issue-recovers.yaml --to … --auth-header "Bearer dev"` → 4/4 200, 2/2 expectations; handler log shows the four events.
- Gates: typecheck ✓ · lint ✓ · tests 160/160 ✓.

## 2026-08-29 · T-042 · `examples/github-action.yml`
- Tests first (3, parse the workflow with `yaml`): one ubuntu job; checkout + setup-node 20 + `npm ci`; starts `examples/express-handler.ts`, waits on `/health`, runs `trial-churns` and `billing-issue-recovers` with `--json` and `--auth-header`.
- Impl: `examples/github-action.yml` — uses `node dist/cli.js run` (built from source in this repo; users with `npm i -g reveclicat` use `rcc run`), uploads the two JSON results + handler log as artifacts, `if: always()`.
- Local rehearsal of the same shell steps: both scenarios exit 0 (3/3 and 4/4 → 200, expectations passed); with a wrong `--auth-header` the run exits 1 and reports the failed `all_responses_status` expectation — exactly what CI needs.
- Gates: typecheck ✓ · lint ✓ · tests 163/163 ✓.

### Epic 4 summary — CI mode
**What works:** `expect:` blocks (step/scenario), exit codes 0/1, `--json` single-document output, a copy-pasteable Express handler that validates/authenticates/dedupes, and a GitHub Actions workflow that wires them together (rehearsed locally).
**Debt:** the workflow was validated by parsing + local shell rehearsal, not by an actual Actions run (no remote CI in v0.1 scope — pushing to GitHub is a human step). `max_response_ms` is a per-event max, not a percentile.
**Next:** Epic 5 — README (T-050), `rcc init` + LICENSE/CONTRIBUTING/CHANGELOG 0.1.0 (T-051), final polish (T-052).

## 2026-08-29 · T-051 · `rcc init`, config defaults, LICENSE, CONTRIBUTING, CHANGELOG 0.1.0
- Taken before T-050 so the README can document `rcc init` and the config file. Spec: init/config sections in `specs/F2-commands.md` (precedence flag > config > default).
- Tests first (11): `loadConfig` (missing → `{}`, valid, malformed JSON / unknown key / bad enum naming the file), `resolveDefaults` precedence, `rcc init` (config + six scenarios + next-step hint; refuses to overwrite, `--force`), config feeding `send` and `run` (flags win), broken config reported with its path. vitest switched to `pool: "forks"` so tests may `process.chdir`.
- Impl: `src/core/config.ts` (`ConfigSchema`, `loadConfig`, `resolveDefaults`, `packageRoot()` walks up to the `reveclicat` package.json so scenarios copy from src/, dist/ or node_modules), `src/commands/init.ts`, `send`/`run` resolve defaults; `--help` texts mention the config file. `LICENSE` (MIT), `CONTRIBUTING.md`, `CHANGELOG.md` cut as `0.1.0`.
- Terminal: `rcc init` in an empty dir → 7 files + next command; second run → refuses with `--force` hint, exit 1.
- Gates: typecheck ✓ · lint ✓ · tests 172/172 ✓.

## 2026-08-29 · T-050 · README (English)
- Tests first (4): non-affiliation disclaimer on the first non-empty line; required sections/placeholders (tagline, What/Why, 60-second quickstart, commands table, scenario format, CI, `<!-- TODO: demo GIF -->`, Authorization, State machine, License, `purr` alias); **bidirectional flag consistency** — every `--flag` in the README exists in `--help` and every `--help` flag is documented; all four commands and seven event types mentioned.
- Wrote `README.md`: disclaimer, tagline, real `rcc run` output, What/Why, quickstart, commands table + examples, config precedence, annotated scenario format, CI section linking both examples, Authorization (plain static header, HMAC out of scope), state diagram, fidelity & scope, contributing, MIT.
- Gates: typecheck ✓ · lint ✓ · tests 176/176 ✓.

## 2026-08-29 · T-052 · Final polish: errors, `--help`, flag consistency
- Review of every error path in the built CLI found: commander usage errors bypassed our formatter and exited 1 (spec says 2); `--port abc` reported `"NaN"`; boolean flags showed `(default: false)`.
- Tests first (13): snapshot of `rcc --help` and all four subcommands (`test/unit/__snapshots__/polish.test.ts.snap`); every subcommand has an example and no `(default: false)`/`coming soon`; shared flags `--to/--auth-header/--seed/--dry-run` exist on both `send` and `run` with identical descriptions where semantics match; usage errors → `✖ … → Run \`rcc <cmd> --help\` for usage.`, exit 2; `--port` keeps the input; `formatError` with/without `RCC_DEBUG`.
- Impl: `buildProgram` installs `exitOverride` (non-zero → 2) and a per-command `outputError` that reuses `formatError`; `cli.ts` handles `CommanderError` (`--help`/`--version` exit 0); booleans without explicit `false` default; `--port` validated as a string.
- Gates: typecheck ✓ · lint ✓ · tests 189/189 ✓ · `npm pack --dry-run`: 14 files, 109.5 kB (dist, scenarios, README, LICENSE).

### Epic 5 summary — Release readiness (and v0.1 milestone)
**Smoke demo, end to end, from a clean directory:** `rcc init` → 6 scenarios + config; `PORT=3011 RC_WEBHOOK_AUTH="Bearer demo" npx tsx examples/express-handler.ts`; `rcc run` on all six scenarios (`--seed 2026`) → 31/31 events answered 200, every expectation passed, spans 7d…365d; `rcc run scenarios/happy-year.yaml --json` parses to 13 events, `ok: true`.
**What works:** the whole v0.1 surface — `send`, `listen`, `run`, `init`, config file, expectations, `--json`, deterministic seeds, actionable errors, English README with disclaimer, MIT license, CONTRIBUTING, CHANGELOG 0.1.0, reference handler and GitHub Action.
**Debt / open items:** T-004 (validate the PROVISIONAL `TEST` schema — needs a human with a RevenueCat dashboard); month arithmetic drifts after a Feb clamp on unseeded runs (Icebox note); the GitHub Action was rehearsed locally, not on GitHub; demo GIF placeholder in README.
**Backlog status:** 18/19 tickets done; T-004 blocked on external access. Nothing left that I can unblock alone.

## 2026-08-29 · T-060 · Epic 6 planning — webhook inbox & `rcc tail` (v0.2)
- Context: the maintainer asked whether a webhook inbox on their cloud could serve other users. Assessment: yes as the "receive" half of the Stripe-CLI analogy, but operating other people's payloads (PII) is a data-custody problem → ADR-004: **self-host first**, same code reusable for a future ephemeral relay, no hosted service now.
- Wrote `specs/F6-inbox.md` (server endpoints/storage/auth, `rcc tail` flags, fidelity loop) and ADR-004; added Epic 6 tickets T-060…T-063 with criteria; Icebox updated (hosted relay, multi-tenant inbox, redaction tooling).
- T-004 in flight in parallel: ngrok tunnel + `rcc listen --verbose` running; waiting for the maintainer to log into the dashboard tab so the webhook can be configured from the browser.

## 2026-08-29 · T-061 · `rcc tail --smee`
- Feasibility first: a real POST to a fresh smee.io channel arrived over SSE as one `data:` JSON line with all request headers (incl. `authorization`), parsed `body`, `timestamp` — documented in `specs/F6-inbox.md`. No dependency needed.
- Tests first (9, against `test/helpers/fake-smee.ts`: `/new` redirect + SSE + POST relay): SSE frame parser (multi-line data, comments), channel creation, unreachable relay, channel URL + dashboard instructions, one-line `real` output, `--verbose`, INVALID path, `--forward` with relayed `Authorization` and local status, forward failure non-fatal, reconnect after drop, clean close.
- Debugging note: the fake initially split JSON across two `data:` lines at an arbitrary offset → invalid JSON → silently dropped. Real smee sends one line; fake fixed, parser multi-line behaviour kept under its own unit test.
- Impl: `src/commands/tail.ts` (`parseSseStream`, `createSmeeChannel`, `startTail` with backoff reconnect, `registerTail`); README "Receive real webhooks" section; CHANGELOG `[Unreleased]`.
- Real smoke: `rcc tail --smee --forward http://localhost:8787/webhook` → channel created → `curl` POST of the RENEWAL fixture to smee.io → printed `real RENEWAL … → 200 (18 ms)` and delivered to the local `rcc listen`. End to end through the public relay.
- Gates: typecheck ✓ · lint ✓ · tests 198/198 ✓.

## 2026-08-29 · T-062 · `rcc inbox` + `rcc tail --inbox`
- Tests first (11): token required; valid deliveries stored with kept headers/raw body/seq and `/health` count; `--auth-header` mismatch → 401 stored `authOk:false`; non-JSON → 400 stored; schema-invalid JSON → 200 stored with `issues[]`; retries linked via `duplicateOf`; 404s; `/events` token auth + `since`/`limit` paging; `/events/stream` SSE replay + live push with header or `?token=`; JSONL persistence across restart + `--max-events` compaction; `tail --inbox` prints/forwards raw body with relayed `Authorization`, 401 → "check --token", `--all` replays in order.
- Impl: `src/commands/inbox.ts` (append-only `Store`, `startInbox`, `registerInbox` with env fallbacks), `tail.ts` gains the `inbox` source (raw-body forwarding, token, since), `examples/inbox/{Dockerfile,Caddyfile}`, README "self-hosted inbox" block, CHANGELOG.
- Terminal smoke: `rcc inbox --port 8790 --auth-header "Bearer rc"` + `rcc tail --inbox … --token tok --forward http://localhost:8787/webhook`: valid+auth → 200 (#1), no auth → 401 stored as `AUTH MISMATCH … (retry of #1)`; tail forwarded both with the relayed header (local `listen` answered 401 because it expects a different header — correct: headers are relayed verbatim). 2 JSONL lines on disk.
- Gates: typecheck ✓ · lint ✓ · tests 209/209 ✓.

## 2026-08-29 · T-004 · Real `TEST` event captured — schema fixed, PROVISIONAL → VERIFIED
- Path: maintainer configured the dashboard webhook to the smee channel with auth `Bearer rcc-t004` → `rcc tail --smee --forward` → `rcc listen --verbose` on :8787. First real event arrived 10:25:04 and our own listener flagged it **INVALID** (400): `transaction_id`, `original_transaction_id`, `is_family_share` (+12 more) are `null` in the real TEST payload; `store` is `PLAY_STORE`. Exactly the fidelity gap the ticket existed for.
- Test first: `schemas.test.ts` "real captured payloads validate" with `test/fixtures/events/real/TEST.json` (red), then `TestEventSchema` = common + identity required, every lifecycle field `nullable().optional()` via a typed `nullableOptional()` helper (green). Lifecycle event schemas unchanged (docs say non-null; no real capture yet — T-063).
- Docs: `payload-sources.md` TEST row → VERIFIED with the observed field table; fixture README; CHANGELOG `Fixed`.
- Rebuilt and restarted the listener; replaying the captured payload → 200. RevenueCat should retry the 400'd delivery (5/10/20/40/80 min) reusing `id`/`event_timestamp_ms` — observation pending below.
- Gates: typecheck ✓ · lint ✓ · tests 210/210 ✓.

## 2026-08-29 · T-063 · Real lifecycle events captured (promotional grant/revoke)
- Maintainer created a v2 API key (stored in `.env`, gitignored); with it I created entitlement `premium` (v2), then via v1 granted/revoked promotional access to customer `rcc_promo_test`. First grant produced nothing: the webhook was "Sandbox only" and promotional events are `PRODUCTION` (confirmed via v2 subscriptions API) → maintainer switched it to "Both". Revoke → `CANCELLATION` + `EXPIRATION` in ~2 s; re-grant → `NON_RENEWING_PURCHASE` in ~2 s.
- Our listener answered **400** to all three: two real defects → T-064 (nulls in "Always" fields) and T-065 (unknown event type rejected). Fixtures saved under `test/fixtures/events/real/` (no PII: synthetic customer). Findings table added to `payload-sources.md`.
- Also observed: the dashboard TEST event we 400'd was never retried (70 min) and does not show in the dashboard's event table.

## 2026-08-29 · T-064 · Lifecycle "Always" fields nullable
- Tests first: real `CANCELLATION`/`EXPIRATION` PROMOTIONAL fixtures must validate (red: `is_family_share`, `country_code`, `renewal_number` null). Fix: `.nullable()` on those, `metadata` nullable. Generator unchanged (App Store values non-null). Suite green.

## 2026-08-29 · T-065 · Unknown event types accepted by receivers
- Tests first (classify unit + listen/inbox/tail): `NON_RENEWING_PURCHASE` and a made-up `FUTURE_EVENT` → `unknown-type`, garbage/missing common fields → `invalid`, known-but-broken (`store: NOPE`) → `invalid`.
- Impl: `UnknownEventSchema` (common + identity + any `type`), `classifyEnvelope()`; `listen` (200 + yellow `UNSUPPORTED <TYPE>`), `inbox` (`unsupportedType: true`), `tail` (same label). README + CHANGELOG.
- Commit note: T-064 and T-065 share `src/schemas/events.ts`, so they are committed together (atomic green commit beats one-ticket-per-commit here).
- Gates: typecheck ✓ · lint ✓ · tests 218/218 ✓.

### Epic 6 summary — Webhook inbox & tail (v0.2 work so far)
**What works (verified against RevenueCat itself, not just tests):** `rcc tail --smee` → real dashboard/API events reach `localhost` in ~2 s; `rcc inbox` + `rcc tail --inbox` for the durable, self-hosted path (Dockerfile + Caddyfile). The capture loop already paid for itself: it found two real defects in one afternoon (nulls in "Always" fields, unknown event types rejected) and closed T-004 (`TEST` no longer provisional). Final live check: after the fixes, a real revoke produced `CANCELLATION` + `EXPIRATION` that the listener accepted with 200 through smee.
**Debt:** the inbox has not been deployed on the maintainer's cloud yet (Dockerfile untested in a real deploy); `rcc send`/`run` still generate only App Store-style payloads (PROMOTIONAL nulls are accepted, not generated); `NON_RENEWING_PURCHASE` is accepted but not modelled (Icebox: non-subscription products).
**Housekeeping for the maintainer:** rotate `RC_SECRET_KEY` (v1) and `RC_V2_KEY` (v2, "MyTestAppV2FullAdmin") — both were pasted in chat; delete the `premium` entitlement / `rcc_promo_test` + `rcc_probe` customers in `mytestapp` if you want the project clean; the smee channel `91nmB1QW1cN9QfV` is public — remove or replace the dashboard webhook when done.

## 2026-08-29 · Release prep + T-066
- Cut `0.1.0` in CHANGELOG (Epic 6 included — no users yet, nothing to break), npm metadata (`homepage`, `bugs`, `files` incl. `examples`, `prepublishOnly = check + build`), `.github/workflows/ci.yml` (Node 20/22: typecheck, lint, test, build, CLI smoke) → first run green on both; actions bumped to v5 after a deprecation annotation. Badges in README.
- `npm publish --dry-run`: 19 files, 146 kB; name `reveclicat` free on the registry. Publishing waits for the maintainer's `npm login`.
- Demo GIF rendered headlessly with `vhs` (`docs/demo.tape` → `docs/demo.gif`): `rcc run happy-year --speed 200 --seed 1` against a hidden `rcc listen`, then `rcc send CANCELLATION --set …`, then `rcc tail --smee`. First cuts exposed (a) `alias` not working in non-interactive bash (fixed with a shell function) and (b) the table appearing only at the end → **T-066**: `createRunTable()` with precomputed widths; header first, rows streamed from `onEvent`. Test: with `--speed 300`, row 1 is visible after 150 ms and row 3 is not. 219/219.

## 2026-08-29 · Release 0.1.0 published
- `npm publish` needed the maintainer's 2FA (passkey) web flow, which only works in an interactive terminal — npm redacts the auth URL and exits `EOTP` when driven headlessly. Maintainer ran `npm publish --access public` locally (`prepublishOnly` = check + build).
- Verified from the public registry into a clean prefix: `reveclicat@0.1.0`, `rcc`/`purr --version` → 0.1.0, `rcc init` → 7 files, `rcc run scenarios/billing-issue-recovers.yaml --dry-run --seed 1` → 4 events, 2/2 expectations; runtime deps exactly `commander`, `yaml`, `zod`.
- GitHub: tag `v0.1.0` + release, CI green on main and tag. https://www.npmjs.com/package/reveclicat
- Still on the maintainer: rotate both RevenueCat API keys pasted in chat; optional cleanup of `mytestapp` (entitlement `premium`, customers `rcc_probe`/`rcc_promo_test`, webhook `reveclicat`).
