# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/); versions follow SemVer.

## [Unreleased]

## [0.1.0] — 2026-08-29

First release. Unofficial project — not affiliated with RevenueCat, Inc.

### Added
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
- Programmatic API (`reveclicat` package): schemas, `Subscriber`, `runScenario`, `loadScenario`, `VirtualClock`, `createRng`.
