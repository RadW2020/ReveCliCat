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
