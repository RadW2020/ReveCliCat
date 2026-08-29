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
