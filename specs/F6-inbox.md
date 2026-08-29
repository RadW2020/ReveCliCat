# F6 — Webhook inbox & `rcc tail` (v0.2)

> Receive **real** RevenueCat webhooks on `localhost` — the "receive" half of the Stripe-CLI analogy. v0.1 only generates synthetic events; this epic adds a small, self-hostable relay so real dashboard/sandbox/production events reach a developer's machine.

## Why a separate server
RevenueCat delivers webhooks by `POST` to a public **HTTPS** URL (S1). A laptop is not reachable. Tunnels (ngrok/cloudflared) work but are ephemeral, and RevenueCat delivers with delay (5–60 s; cancellations up to 2 h) and retries for ~2.5 h — a store-and-forward inbox captures everything even when nobody is listening.

## Two sources for `rcc tail`, one UX

| Source | Setup | Persistence | Auth | Use when |
|--------|-------|-------------|------|----------|
| `--smee [url]` — public relay smee.io (GitHub's; SSE, no account) | zero: `rcc tail --smee` creates a channel and prints the URL to paste in the dashboard | none — events only arrive while `tail` is connected | none (unguessable URL); payloads transit a third party in memory | local dev, quick captures, demos |
| `--inbox <url> --token <t>` — self-hosted `rcc inbox` | deploy a container behind HTTPS | append-only JSONL incl. retries | bearer token + RevenueCat `Authorization` check | CI, long-running capture, privacy |

Verified 2026-08-29: a POST to a smee channel is delivered over SSE as `data: { <all request headers lower-cased, incl. "authorization">, "body": <parsed JSON>, "query": {}, "timestamp": <ms> }` after an initial `event: ready`. The body is *parsed*, not raw. `GET https://smee.io/new` → 302 to a fresh channel URL. No dependency needed (`smee-client` not used).

## Deployment model (ADR-004)
**Self-host first.** The inbox is a subcommand of the same binary (`rcc inbox`) with zero extra dependencies, so a user runs it on their own VPS/PaaS/container (`Dockerfile` in `examples/inbox/`). ReveCliCat, Inc.-style hosting of other people's payloads is explicitly *not* part of this epic (payloads contain PII).

## `rcc inbox` (T-062) — the server

| Env / flag | Default | Meaning |
|------------|---------|---------|
| `--port` / `PORT` | 8788 | listen port (put HTTPS in front: Caddy, PaaS, Cloudflare) |
| `--token` / `INBOX_TOKEN` | **required** | bearer token clients must present to read events |
| `--auth-header` / `RC_WEBHOOK_AUTH` | — | value RevenueCat must send as `Authorization`; mismatches are stored as `rejected` and answered 401 |
| `--data-dir` / `INBOX_DATA_DIR` | `./inbox-data` | JSONL storage (`events.jsonl`), append-only |
| `--max-events` | 10 000 | ring buffer; oldest lines dropped on compaction |

Endpoints:
- `POST /webhook` — always stores `{ seq, receivedAt, headers: {authorization?, user-agent, content-type}, body (raw string), valid: boolean, issues?: [...] , authOk: boolean }`. Answers **200** to valid+authOk (so RevenueCat stops retrying), **401** to auth mismatch, **400** to non-JSON. Invalid-but-JSON envelopes are stored (that is the point — to learn) and answered 200.
- `GET /events?since=<seq>&limit=<n>` — `Authorization: Bearer <token>`; returns `{ events: [...], next: <seq> }`.
- `GET /events/stream?since=<seq>` — Server-Sent Events, same auth (token via header or `?token=` for EventSource); event name `webhook`, data = stored record; `: ping` every 25 s.
- `GET /health` — `{ ok: true, events: <count> }`, no auth.
- Everything else → 404 JSON.

Retries: records with an identical `event.id` are stored as separate lines (`duplicateOf: <seq>`) — we *want* to see RevenueCat's retries.

## `rcc tail` (T-061 smee, T-062 inbox) — the client

`rcc tail --smee [channel-url] [--forward http://localhost:3000/webhook] [--verbose]`
`rcc tail --inbox https://hooks.example.com --token <t> [--since <seq>|--all] [--forward …] [--verbose]`

- Exactly one source. `--smee` without a URL creates a channel and prints: `Paste this URL in RevenueCat → Integrations → Webhooks: https://smee.io/…`. With a URL, reuses it (so the dashboard config survives restarts).
- Connects to the source's SSE stream, prints each event with the same one-line format as `rcc listen` (`time  TYPE  app_user_id  product_id`) plus `real` marker; `--verbose` prints the body.
- `--forward <url>`: re-POSTs the **raw body** and original `Authorization` to a local URL and shows the local status. This is the Stripe-CLI experience: real events hit your local handler.
- `--since 0` / `--all` replays history first, then follows. Default: follow from now (`since = latest`).
- Reconnects with backoff; Ctrl-C exits 0.
- Errors: unreachable inbox / 401 → actionable (`check --token`).

## Fidelity feedback loop (T-063)
Real payloads captured through the inbox (redacted with `rcc inbox redact`? — no: manual for v0.2) become fixtures in `test/fixtures/events/real/*.json` and flip `PROVISIONAL` rows in `docs/payload-sources.md`. First target: the dashboard `TEST` event (T-004).

## Out of scope (Icebox)
Hosted public relay (smee.io model), web UI for the inbox, multi-tenant inbox, encryption at rest, payload redaction tooling.
