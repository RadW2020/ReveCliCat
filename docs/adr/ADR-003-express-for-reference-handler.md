# ADR-003 — `express` as a dev-only dependency for the reference handler

**Status:** Accepted · **Date:** 2026-08-29 · **Ticket:** T-041

## Context
T-041 asks for `examples/express-handler.ts`, a minimal idempotent webhook handler developers can copy. Express is what most Node webhook receivers use, so the example is most useful in Express. The CLI itself uses `node:http` (`rcc listen`) and needs no framework.

## Decision
Add `express` (v5) and `@types/express` as **devDependencies** only. They are used by `examples/express-handler.ts`, its test, and the GitHub Action example. They are not imported by anything under `src/` and do not ship to `npm i -g reveclicat` users.

The example imports schemas from `"reveclicat"` (the package name) so it is copy-paste correct for users. Inside this repo that name resolves to `src/index.ts` via `tsconfig` `paths` (typecheck/tsx) and a `vitest` alias (tests).

## Consequences
- Runtime dependency footprint unchanged (`commander`, `zod`, `yaml`).
- The example doubles as an integration test of the public schema API.
