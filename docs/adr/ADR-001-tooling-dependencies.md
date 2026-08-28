# ADR-001 — Tooling dev-dependencies beyond the core stack

**Status:** Accepted · **Date:** 2026-08-29 · **Ticket:** T-001

## Context
The approved runtime/tooling stack is TypeScript, `commander`, `zod`, `vitest`, `tsup`. The Constitution (art. 7) requires an ADR for anything else. T-001 asks for lint and a working developer loop.

## Decision
Add these **dev-only** dependencies (none ship to users):
- `eslint`, `@eslint/js`, `typescript-eslint` — the lint gate required by the Constitution (art. 6), type-aware rules.
- `@types/node` — Node typings for strict TS.
- `tsx` — run `src/cli.ts` and `examples/*.ts` without a build step (`npm run dev`, GitHub Action example).

No formatter (Prettier) is added: ESLint + editor defaults are enough for v0.1 and one less tool to configure.

## Consequences
- Zero new runtime dependencies; `npm i -g reveclicat` still pulls only `commander` and `zod`.
- Type-aware lint is slower (~seconds) but catches floating promises and unsafe `any`, which matter in an HTTP/CLI tool.
