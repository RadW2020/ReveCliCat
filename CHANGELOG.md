# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/); versions follow SemVer.

## [Unreleased]

## [0.1.1] — 2026-08-29

### Fixed
- npm page: demo GIF and CI badge were broken (repository was private; GIF used a relative path). Repository is now public and the GIF uses an absolute URL.

### Added
- `release.yml` workflow: pushing a `v*` tag publishes to npm via trusted publishing (OIDC, provenance), after checking the tag matches `package.json`.

## [0.1.0] — 2026-08-29

First release. Unofficial project — not affiliated with RevenueCat, Inc.

### Fixed
- Lifecycle schemas: `is_family_share` and `country_code` are nullable, `renewal_number`/`metadata` accept explicit `null` — real `CANCELLATION`/`EXPIRATION` events (store `PROMOTIONAL`, captured 2026-08-29) carry nulls where the docs say "Always". (T-064)
- `rcc listen`, `rcc tail` and `rcc inbox` no longer reject well-formed events of types outside the seven (`NON_RENEWING_PURCHASE`, future types): they are accepted (200), shown as `UNSUPPORTED <TYPE>`, stored and forwarded. New `classifyEnvelope()` / `UnknownEventSchema` in the public API. (T-065)
- `TEST` event schema: a real dashboard test event (captured 2026-08-29) carries `null` in every subscription-lifecycle field (`transaction_id`, `is_family_share`, prices, `renewal_number`, `metadata`…) and `store: PLAY_STORE`; the schema now accepts that and is no longer provisional. (T-004)

### Added (receiving real webhooks)
- `rcc tail --smee [url]` — receive **real** RevenueCat webhooks on your machine through the public smee.io relay (zero setup, no persistence); validates and prints each event like `rcc listen`; `--forward <url>` re-POSTs body + original `Authorization` to a local handler; `--verbose`. (T-061)
- `rcc inbox` — self-hosted persistent webhook inbox (`--token`, `--auth-header`, `--port`, `--data-dir`, `--max-events`; env `INBOX_TOKEN`, `RC_WEBHOOK_AUTH`, `PORT`, `INBOX_DATA_DIR`) with `POST /webhook`, `GET /events`, `GET /events/stream` (SSE), `GET /health`; `rcc tail --inbox <url> --token <t> [--since <seq>|--all]` reads from it. `examples/inbox/` Dockerfile + Caddyfile. (T-062)

### Added (generating & simulating)
- `rcc run` prints the header up front and each table row as soon as its event is delivered (visible with `--speed`). (T-066)
- `rcc send <EVENT_TYPE>` — send one schema-valid event; flags `--to`, `--store`, `--user`, `--product`, `--auth-header`, `--environment`, `--set key=value` (repeatable, dot paths), `--seed`, `--dry-run`. Runs a minimal coherent prelude so any of the 7 event types can be sent alone. (T-020)
- `rcc listen` — local receiver with `--port`, `--forward`, `--auth-header` (flags `AUTH MISMATCH`, 401), `--verbose`; validates envelopes against the official schemas. (T-021)
- `rcc run <scenario.yaml>` — executes YAML scenarios on a virtual clock; flags `--to`, `--auth-header`, `--speed instant|<ms>`, `--seed`, `--dry-run`, `--json`. Table + summary output; exit 1 on non-2xx or failed expectations. (T-031, T-040)
- Scenario format: `subscriber` (`app_user_id`, `product_id`, `period`, `trial`, `grace_period`, `store`, `environment`), `steps` of `event`/`advance` with optional `set` and `expect.response_status`, scenario-level `expect.all_responses_status` / `expect.max_response_ms`. Validation errors point to `file:line:column`. (T-030, T-040)
- Six example scenarios: `trial-converts`, `trial-churns`, `billing-issue-recovers`, `billing-issue-churns`, `cancel-then-uncancel`, `happy-year`. (T-032)
- Zod schemas for `TEST`, `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`, `BILLING_ISSUE`, `EXPIRATION` and the webhook envelope, derived from the official docs (see `docs/payload-sources.md`). (T-003)
- `examples/express-handler.ts` — minimal idempotent Express handler (auth check, schema validation, dedupe by `event.id`). (T-041)
- `examples/github-action.yml` — CI workflow that starts the handler and runs two scenarios with `--json`. (T-042)
- `rcc init` — creates `reveclicat.config.json` and `scenarios/` with the six examples; `--force` to overwrite. `send`/`run` read defaults (`to`, `authHeader`, `store`, `environment`) from the config file; flags win. (T-051)
- MIT license, CONTRIBUTING guide. (T-051)
- Consistent error output: every error prints `✖ message` + `→ hint`; usage errors (unknown command/option, missing argument) exit with code 2, other failures with 1; `RCC_DEBUG=1` shows stack traces; `NO_COLOR` honoured. (T-052)
- Programmatic API (`reveclicat` package): schemas, `Subscriber`, `runScenario`, `loadScenario`, `VirtualClock`, `createRng`.

[Unreleased]: https://github.com/RadW2020/ReveCliCat/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/RadW2020/ReveCliCat/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/RadW2020/ReveCliCat/releases/tag/v0.1.0
