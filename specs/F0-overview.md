# F0 — Overview & architecture

ReveCliCat is a TypeScript CLI that simulates the lifecycle of a RevenueCat subscriber and delivers synthetic-but-faithful webhook events to a developer's endpoint, locally or in CI.

> Unofficial project. Not affiliated with RevenueCat, Inc.

## Goals (v0.1)
- Generate webhook payloads that validate against schemas derived from the **official** RevenueCat docs (see `docs/payload-sources.md`).
- Chain events through a **state machine** so sequences are coherent (same IDs, forward-moving time, mutating fields).
- Deliver events over HTTP POST to `localhost` or any URL. No tunnel needed.
- Run **scenarios** from YAML with a deterministic virtual clock; assert on responses; exit 0/1 for CI.

## Non-goals
See `docs/BACKLOG.md` → Icebox.

## Stack
TypeScript strict · Node ≥ 20 · ESM · `commander` · `zod` · `vitest` · `tsup`. Anything else needs an ADR (`docs/adr/`).

## Package layout

```
src/
  cli.ts                 # entry: shebang, buildProgram().parseAsync()
  program.ts             # buildProgram(): commander root + subcommands
  commands/
    send.ts              # rcc send <EVENT_TYPE>
    listen.ts            # rcc listen
    run.ts               # rcc run <scenario.yaml>
    init.ts              # rcc init
  core/
    clock.ts             # VirtualClock, parseDuration, addDuration
    rng.ts               # seeded PRNG, uuid()
    state-machine.ts     # states, transition(), legalEvents(), IllegalTransitionError
    subscriber.ts        # Subscriber: holds state + clock + ids; emit(eventType) -> Event
    scenario.ts          # loadScenario(): YAML -> validated Scenario (line/col errors)
    engine.ts            # runScenario(): steps -> HTTP -> results + expectations
    http.ts              # postEvent(url, envelope, authHeader) -> { status, latencyMs }
    config.ts            # reveclicat.config.json loading
    errors.ts            # RccError + formatError()
    output.ts            # table/summary/colour helpers (plain ANSI, no deps)
  schemas/
    common.ts            # enums (store, environment, period_type, ...), base fields
    events.ts            # one schema per event type, EventSchema union, Envelope
    index.ts
  index.ts               # public API (schemas, Subscriber, runScenario) for programmatic use
test/
  unit/  integration/  fixtures/events/*.json
scenarios/               # the 6 shipped examples (also copied by `rcc init`)
examples/                # express-handler.ts, github-action.yml
docs/  specs/
```

## Key design decisions (summary; details in ADRs)
- **Pure core, thin CLI.** `core/` has no I/O except `http.ts`. Commands only parse flags, call core, format output. Everything is testable in-process.
- **State machine drives payloads.** `Subscriber.emit(type)` first checks legality (`transition`), then builds the payload from current state + clock, then validates it with the zod schema before returning. An invalid payload is a bug, never an output.
- **Virtual clock, real HTTP.** Time is simulated (`advance: P1M`); delivery is real. `--speed` only adds wall-clock sleeps between events.
- **Determinism.** `--seed` fixes the clock start, the PRNG and therefore every UUID/transaction id. Same seed + same scenario ⇒ identical payloads.
- **Fidelity over invention.** Schemas only contain fields documented by RevenueCat. Unknown/unverified → `PROVISIONAL` in `docs/payload-sources.md`.
- **Errors are product.** One `RccError` type with `hint`; one formatter; exit codes: 0 ok, 1 failure (transport, validation, expectations), 2 usage (commander).

## Data flow (rcc run)

```
scenario.yaml ─▶ loadScenario ─▶ Scenario
                                   │
                    for each step  ▼
   advance ──▶ VirtualClock.advance(d)
   event   ──▶ Subscriber.emit(type, set) ──▶ Event (validated)
                                   │
                                   ▼
                     postEvent(to, {api_version:"1.0", event}) ──▶ {status, latencyMs}
                                   │
                                   ▼
                  results[] ──▶ evaluate expect blocks ──▶ table / --json ──▶ exit 0|1
```

## Quality gates
`npm test` (vitest) · `npm run lint` (eslint) · `npm run typecheck` (tsc --noEmit) · all green before every commit.
