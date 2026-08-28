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
