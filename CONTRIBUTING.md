# Contributing to ReveCliCat

Thanks for helping. ReveCliCat is an unofficial project, not affiliated with RevenueCat, Inc.

## Dev loop

```bash
npm install
npm run dev -- send TEST --dry-run   # run the CLI from source (tsx)
npm test                             # vitest (unit + integration; integration builds dist/)
npm run lint && npm run typecheck    # both must be clean before every commit
npm run build                        # tsup → dist/cli.js (rcc / purr) + dist/index.js (API)
```

## How work is organised (spec-driven)

- **Every change starts with a ticket** in `docs/BACKLOG.md` (ID `T-XXX`, acceptance criteria). If a spec in `specs/` is ambiguous, fix the spec first, then the code.
- **Tests first.** Write failing tests from the acceptance criteria, then implement. Never weaken a test to make it pass.
- **Payload fidelity.** Schema fields and enums must trace to the official RevenueCat docs — record the source and date in `docs/payload-sources.md`. No fields from memory.
- **Decisions → ADRs.** Anything non-trivial, and every new dependency, gets a short ADR in `docs/adr/` (context / decision / consequences).
- **Traceability.** Log each session in `docs/WORKLOG.md`; move the ticket to Done; update `CHANGELOG.md` and the README when the CLI surface changes.
- **Commits.** Conventional Commits in English, one ticket per commit: `feat(T-021): ...`, `fix(T-030): ...`, `docs(...)`, `test(...)`, `chore(...)`.

## Releasing

Changes accumulate under `## [Unreleased]` in `CHANGELOG.md`. To ship:

1. Move the entries to a new `## [x.y.z] — date` section (patch for fixes/docs, minor for new features or CLI/YAML surface changes while we are 0.x).
2. `npm version patch|minor` — bumps `package.json`, commits and tags `vx.y.z` in one step.
3. `git push --follow-tags` — the `release` workflow publishes to npm (trusted publishing, no local credentials) once CI-equivalent checks pass.

Never republish an existing version; npm versions are immutable.

## Scope

v0.1 is deliberately small (App Store only, 7 event types, no tunnel/UI/hosting). New ideas go to the **Icebox** section of the backlog with a one-line justification — they are not implemented in v0.1.

## Reporting a payload mismatch

If a real RevenueCat event fails validation in `rcc listen`, open an issue with the (redacted) payload and the `INVALID` line — that is exactly the feedback that keeps the schemas faithful. A captured real `TEST` event is especially welcome (see ticket T-004).
