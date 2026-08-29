# ADR-004 — Webhook inbox is self-hosted; ReveCliCat never custodies users' payloads

**Status:** Accepted · **Date:** 2026-08-29 · **Ticket:** T-060

## Context
Users (and we, for T-004) need real RevenueCat webhooks to reach `localhost`. Options: (1) ship a self-hostable inbox users deploy on their own infra; (2) run a public ephemeral relay (smee.io model); (3) run a persistent hosted inbox with accounts. RevenueCat payloads carry PII (`$email`, `app_user_id`, prices, country). Whoever operates the server that receives them is a data processor for third parties' customers.

## Decision
Build **(1)** first: `rcc inbox` is a subcommand of the existing binary with no new dependencies, plus a `Dockerfile` example. The same code must run unchanged in a future relay (2) with persistence disabled, but (2) and (3) are **not** built or operated as part of the project until there is demand and a privacy/TOS story. The project never receives, stores or proxies other people's webhook data.

## Consequences
- Zero operating cost, uptime duty or GDPR exposure for the maintainer; users keep their data on their infra.
- Slightly more setup for users (deploy a container / `npx reveclicat inbox` on a VPS) than a hosted URL. Mitigated by `examples/inbox/` (Dockerfile + Caddy snippet) and a one-screen README section.
- Design constraint: token auth and append-only JSONL storage must be good enough for a single-tenant server exposed to the internet; no multi-tenancy.
