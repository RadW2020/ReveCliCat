# Market validation — does anyone need ReveCliCat? (2026-08-29)

Research date: **2026-08-29**. Method: three parallel research passes (developer pain, competitive landscape, audience and channels) over the RevenueCat Community forum, GitHub issues, Reddit (via archive), Hacker News, npm, official docs/blog/changelog. Every quote below is verbatim text read on the linked page on the research date. Reddit and Medium block direct fetches; Stack Overflow yielded nothing relevant.

Companion to [`revenuecat-webhooks-2026-08-29.md`](revenuecat-webhooks-2026-08-29.md) (payload research). This file answers *why* and *for whom*; that one answers *what*.

---

## 1. Headline

- The pain is **real, recurring (2021 → 2026) and confirmed in writing by RevenueCat staff**: there is no local/CLI/synthetic-event path for webhooks; the recommended workaround is a tunnel (ngrok/localtunnel) plus real sandbox purchases.
- The pain is **niche and episodic**: felt at integration time, then forgotten. Dozens of threads over five years, not hundreds. No willingness-to-pay signal. Two 2026 OSS attempts at the same idea have 0 stars.
- **RevenueCat shipped an official CLI (`@revenuecat/cli`, binary `rc`) on 2026-08-25**, four days before ReveCliCat 0.1.0. It manages webhook *configuration* (`list/show/create/update/delete`) and can `simulate-purchase` against the Test Store. It does not trigger a chosen event, chain a lifecycle, listen locally or assert. Verified on the npm registry (`created 2026-08-25T20:11Z`, 0.1.1 on 2026-08-27) and in the README of https://github.com/RevenueCat/cli.
- Differentiation that survives: **on-demand, chained, deterministic lifecycle events — including failure paths — offline, for localhost and CI**, plus payload fidelity backed by real captures. Nothing official or on npm/GitHub does that.

## 2. How developers test RevenueCat webhooks today (ranked by frequency in the evidence)

1. **ngrok / localtunnel** to a local server — recommended by RC staff (2024, 2025) and required by RC's own IntelliJ plugin (Dec 2025).
2. **Real sandbox purchases and waiting for renewals** — RC's official recommendation; ≥ 9 threads report `INITIAL_PURCHASE` arriving and `RENEWAL`/`CANCELLATION`/`EXPIRATION` never arriving or arriving late.
3. **Dashboard "send test event"** — a single generic `TEST` payload; used as a connectivity smoke test; three threads note "test works, real events don't".
4. Enabling Platform Server Notifications to reduce misses; calling `GET /subscribers` after each webhook instead of trusting the payload; hand-crafted Postman POSTs (blocked by auth/shape confusion); Lambda proxies to route by environment; ad-hoc dedupe; **or abandoning webhooks for client polling** (Oct 2025, after "more than eight working days").

## 3. Evidence (verbatim quotes)

### 3.1 "No local testing / no CLI like Stripe"

| Date | Who | Quote | URL |
|---|---|---|---|
| 2024-09-08 | indie dev | "Is there any possible way to test revenueCat's webhook events in my local envirement? I mean something like stripe CLI tool or any way to see the events on my local machine without need to deploy a test server or directly test in production" | https://community.revenuecat.com/third-party-integrations-53/webhook-local-envirement-testing-5082 |
| 2024-09 | **RC staff** (Michael Fogel) | "We dont have a CLI tool like Stripe, so testing with Sandbox purchases or using the dashboard is the best bet here!" | same thread (1,451 views) |
| 2025-07-03 | indie dev | "Stripe has tools that let you proxy the webhook to a local server running, which is great. Iterating faster and fixing small issues and testing edge cases with a deployed web server isn't really feasible imo for developing payment integrations. Does RC not support anything similar?" | https://community.revenuecat.com/dashboard-tools-52/is-there-no-way-to-do-local-testing-with-webhooks-6574 |
| 2025-07-08 | **RC staff** (Hussain) | "At the moment RevenueCat doesn't offer a built-in proxy for local webhook testing, so you'll need to expose your local server to the internet using a tunneling tool." | same thread (827 views) |
| 2024-02-19 | **RC staff** (jefago) | "There isn't right way a way to test this extension locally (it's correct, you would need to use ngrok or something similar to catch webhooks locally" | https://github.com/RevenueCat/firestore-revenuecat-purchases/issues/46 (open since 2022-12) |
| 2024-03-25 | dev | "If you need a reference on how it should look, it's stripe local webhooks. That's how it should work." | same issue |
| 2025-05-14 | dev | "Sounds like we just need a revenue cat emulator like Firebase ;)" | same issue |
| 2025-12-15 | **RC staff** blog | "This plugin includes a lightweight local server to listen for webhook events, so you'll need to configure webhook integration on the RevenueCat dashboard and install ngrok" | https://www.revenuecat.com/blog/engineering/revenuecat-intellij-plugin/ |
| 2023-03-07 | dev → RC staff (Cody) | "End-to-end testing of IAP is painful. On iOS, I can't do Storekit testing on simulator without running through Xcode (how to implement in headless ci?)" — "we definitely want to do anything we can to make this process easier." | https://community.revenuecat.com/sdks-51/feature-request-mock-at-server-level-2641 |

### 3.2 Test-event / replay limitations

| Date | Who | Quote | URL |
|---|---|---|---|
| 2025-12-05 | dev | "It would be very useful to have a 'Resend' button next to a webhook in the dashboard … similar to what Stripe provides." Also asks to choose the event type for the test event. **Staff** (2025-12-08): "I will go ahead and share these suggestions internally." | https://community.revenuecat.com/sdks-51/webhook-replay-7209 |
| 2023-02-01 | dev | "But it's hard to test some event types so I would like to send events from postman through the Webhook url" — staff: "We recommend just testing through sandbox all the time" | https://community.revenuecat.com/general-questions-7/how-to-send-webhook-events-from-postman-2523 |
| 2025-01-27 | **RC staff** (Cody) | "At this time, we don't have the ability to replay failed events after the retry period ends." | https://community.revenuecat.com/general-questions-7/manually-trigger-webhook-events-2086 |
| 2021-08-11 | dev | "RC test event doesn't contain email and name attributes. Making it impossible for tools to build a scheme" | https://community.revenuecat.com/third-party-integrations-53/webhook-test-event-doesn-t-have-attributes-268 |

### 3.3 Sandbox flakiness, missing lifecycle events, waiting on clocks

| Date | Who | Quote | URL |
|---|---|---|---|
| 2024-08-27 | dev | "The INITIAL_PURCHASE webhook is being delivered correctly, but I'm not receiving the RENEW, CANCELLATION, or EXPIRATION events." (unresolved) | https://community.revenuecat.com/third-party-integrations-53/issues-with-missing-webhooks-for-renew-cancellation-and-expiration-events-in-sandbox-testing-5012 |
| 2024-08-28 | dev | "events such as renew, cancellation, and expiration are not being received. Is this expected behavior in the sandbox environment?" | https://community.revenuecat.com/third-party-integrations-53/webhooks-not-being-received-properly-in-sandbox-environment-5023 |
| 2024-11-01 | **RC staff** | "While production and sandbox should work the same, the resources provided by the stores are limited" | https://community.revenuecat.com/third-party-integrations-53/expiration-is-not-received-immediately-after-cancellation-event-is-triggered-in-ios-sandbox-5370 |
| 2025-01-13 | dev | "I think this workflow is a poor developer experience. You shouldn't have to wait 36 minutes to clear a previous purchase." | https://community.revenuecat.com/general-questions-7/how-to-force-sandbox-tester-to-have-a-faster-expiration-date-for-auto-renewable-subscriptions-3551 |
| 2025-03-24 | **RC staff** | "If you want to test the true platform purchase flow (via Sandbox), there isn't a way to speed up renewals, unfortunately." | same thread |
| 2025-10-29 | Expo dev | "I am using a test store (ios for now), and when I make a purchase … webhook never triggers?" (0 replies, closed) | https://community.revenuecat.com/general-questions-7/webhook-not-triggering-for-test-store-7054 |
| 2022-04-27 | dev | Tried to force `BILLING_ISSUE` with a declined Play test card; `billingIssueDetectedAt` stayed null; unresolved | https://community.revenuecat.com/sdks-51/testing-billing-errors-1547 |
| 2026-04-14 | dev | "These specific manual dashboard events are only dispatched as Production events." | https://community.revenuecat.com/dashboard-tools-52/granting-entitlements-through-rc-dashboard-updating-serverusing-webhooks-7595 |
| 2025-05-06 | dev | First webhook delivered 6 h 20 min after the event | https://community.revenuecat.com/general-questions-7/webhook-delay-caused-subscription-status-bug-first-event-delayed-by-6-hours-6342 |

### 3.4 Multi-environment, ordering, idempotency

| Date | Who | Quote | URL |
|---|---|---|---|
| 2025-10-16/21 | dev | "webhooks don't always fire in the correct order (for example, 'Cancel' events sometimes arrive before the 'First Purchase')"; "I decided to switch my strategy to client-side polling." — staff: "These feature requests have all been shared with the team, though I don't have an ETA" | https://community.revenuecat.com/third-party-integrations-53/webhook-limitations-how-to-handle-webhooks-for-multi-environment-setup-6983 |
| 2024-06-06 | Flutter dev | "I need a way to guarantee that the webhook call is completed before the app is notified of the new entitlement." — staff: "We can't guarantee which one will be delivered first" | https://github.com/RevenueCat/purchases-flutter/issues/1094 |
| 2023-11-23 | r/dotnet | "even when they sent api call, it was adding the same item 3 times) I fixed that by checking bill id & disabling next request for 10 seconds" | https://www.reddit.com/r/dotnet/comments/1823ptj/net_core_best_way_to_prevent_duplicate_web/kagbj2h/ |
| 2023-03-01 | r/FlutterDev | "Revenuecat does not send you the end-state … You would need to safe all events and aggrrgate them" | https://www.reddit.com/r/FlutterDev/comments/11f82ia/revenue_cat_for_flutter/jai8ybc/ |
| 2025-03-01 | r/swift | "You are going to spend significant time testing all the edge cases and making sure every webhook event is handled properly" | https://www.reddit.com/r/swift/comments/1j0mbbw/why_do_people_use_services_like_revenuecat/mfd7fjt/ |
| 2021-05-26 | HN | "sometimes the events came out of order, which is what led to bugs when PRODUCT_CHANGE was after RENEWAL" | https://news.ycombinator.com/item?id=27290318 |

### 3.5 Counter-evidence

- 2025-05-03, r/reactnative: "Using revenuecat webhooks. Overall I didnt find any issues implementing it." — https://www.reddit.com/r/reactnative/comments/1kdv8os/adapty_vs_revenuecat_vs_qonversion/mqe0x9h/
- 2025-12-04, HN: "They have handled all the complexities beautifully." — https://news.ycombinator.com/item?id=46149785
- RC staff consistently frame sandbox + dashboard test event as sufficient; the docs now have a `Retry` button for failed deliveries (replay gap narrower than the 2022–2025 threads suggest).
- Reddit RC discussions are overwhelmingly "RC vs StoreKit 2" and lean positive; none is specifically about testing webhooks.
- Two GitHub repos framed exactly like ReveCliCat have 0 stars: https://github.com/zarpa-cat/rc-webhook-inspector (2026-03-22, "synthetic event generation, replay, and inspection", empty README) and https://github.com/gui64/rc-webhook-visualizer (2026-01-03, "Mock Mode").

## 4. Competitive landscape (as of 2026-08-29)

| Existing thing | Fires events to your endpoint | Choose event type | Full coherent lifecycle | Instant / deterministic | Offline, no RC account | localhost w/o tunnel | CI assertions | Receives real webhooks locally |
|---|---|---|---|---|---|---|---|---|
| Dashboard "test webhook" | one `TEST` sample | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | – |
| Dashboard `Retry` | existing events | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | – |
| Apple/Google sandbox, StoreKit config | SANDBOX events | ✗ (indirect) | partial; refunds/billing issues mostly untestable; renewals capped; "not all renewals are reflected" | ✗ (min–h) | ✗ | ✗ | poor | – |
| Customer History manual actions | `NON_RENEWING_PURCHASE`, `TRANSFER`, refund/cancel (Play/Web Billing) — always PRODUCTION | very limited | ✗ | ✓ | ✗ | ✗ | ✗ | – |
| Test Store (2025-12-19) | sandbox transactions; webhook firing undocumented | success/fail/cancel | auto-renew ×5 then cancel; no `BILLING_ISSUE`/refund | partly (5 min–1 h) | ✗ | ✗ | client-side only | – |
| **`@revenuecat/cli` `rc` (2026-08-25)** | `simulate-purchase` (Test Store); `subscriptions cancel/refund/extend` (Web Billing only) | 3–4 actions | ✗ | ✓ for those | ✗ | ✗ | `--json --no-input`, no listener | ✗ |
| RC MCP (2025-09-01) / AI Toolkit (2026-05-22) | ✗ | ✗ | ✗ | – | ✗ | ✗ | ✗ | ✗ |
| Unofficial CLIs (`revcat` ×2, `revenuecat-cli`, `@izantech/revenuecat-cli`) | ✗ (webhook config CRUD) | ✗ | ✗ | – | ✗ | – | ✗ | ✗ |
| `@puzzmo/revenue-cat-webhook-types` (2025-07) | types only | – | – | – | ✓ | – | – | – |
| ngrok / smee / Hookdeck / Svix Play / webhook.site | relay | ✗ | ✗ | – | ✗ | tunnel | Hookdeck replay | ✓ |
| **ReveCliCat 0.3.0** | synthetic, RC-shaped | ✓ | ✓ (state machine, 3 stores) | ✓ | ✓ | ✓ | ✓ | ✓ (smee relay / self-hosted inbox) |

Sources: https://www.revenuecat.com/docs/integrations/webhooks · https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store · https://www.revenuecat.com/docs/test-and-launch/sandbox/google-play-store · https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store · https://www.revenuecat.com/blog/company/revenuecat-test-store · https://www.npmjs.com/package/@revenuecat/cli · https://github.com/RevenueCat/cli · https://www.revenuecat.com/blog/company/introducing-revenuecat-mcp · https://www.revenuecat.com/changelog/release/configure-revenuecat-directly-from-your-ai-code-editor-2026-05-22 · https://docs.stripe.com/stripe-cli/triggers · https://github.com/adrienverge/localstripe (closest analogue: "A fake but stateful Stripe server that you can run locally").

Adjacent providers: Adapty and Qonversion offer no test-event button, simulator or CLI (separate sandbox URLs only); Glassfy shut down 2024-12-31.

## 5. Who (personas) and how many

- **Persona A (dominant in 2025–26 material):** mobile dev (Flutter / React Native / SwiftUI) with a Supabase, Firebase or Convex backend that mirrors entitlements via webhook. Evidence: Supabase Edge Function threads (2025-06), Shipaton 2025 sample repos, RN+Expo+Supabase tutorial (2026-02-14, buildcamp.io), "RevenueCat webhooks + Firebase + SwiftUI, where do I start" (2025-09-28), the official Firebase extension, `convex-revenuecat` (npm, 2026-05).
- **Persona B:** backend-first teams (Node/Laravel/Rails) using their server as source of truth — staff recommend webhooks for this and simultaneously warn against mirroring everything (https://community.revenuecat.com/general-questions-7/best-practices-on-handling-webhooks-5054, 2024-09).
- **Persona C:** teams with dev/preview/prod environments needing reproducible sequences in CI (thread 6983).
- **Scale:** RevenueCat's *State of Subscription Apps 2026* covers 115,000+ apps, $16B+ revenue (2026-03-19); the Series C release (2025-05-22) claims over one in three new subscription apps ship with RevenueCat. **No public figure on webhook adoption.** Webhooks are a Pro feature (free below $2,500 MTR). Realistic ceiling by analogy: Stripe CLI has ~2.2k GitHub stars on a vastly larger base → low hundreds of stars if RevenueCat amplifies, tens otherwise.

## 6. Channels ranked by fit

1. **RevenueCat Community forum** (9,269 members; "Third-Party Integrations" 525 topics). Reply in the exact threads people find when searching: 5082, 6574, 7209, and GitHub issue firestore-revenuecat-purchases#46.
2. **Shipaton 2026** — runs 2026-08-01 → 2026-09-30 (https://www.revenuecat.com/blog/company/announcing-shipaton-2026); 21,564 registered on Devpost at research time (https://revenuecat-shipaton-2026.devpost.com/); Discord https://discord.gg/shipaton. Highest density of people wiring RevenueCat for the first time, *right now*.
3. **Reddit**: r/FlutterDev (~182k), r/reactnative (~188k), r/iOSProgramming (~204k), r/Supabase (~44k) — frame as "testing IAP webhooks locally", not the brand.
4. **GitHub `revenuecat` topic** (182 repos; no simulator/mock/CLI in it) — already tagged.
5. RevenueCat's own channels: integrations directory lists commercial partners only; no community-tools list exists; Sub Club podcast / newsletter are growth-marketing audiences (poor fit). Possible DevRel pitch: a playbook for the AI Toolkit, or a mention next to `rc`.

## 7. Risks

- **Obsolescence, not competition.** RevenueCat shipped MCP (2025-09), Test Store (2025-12), AI Toolkit (2026-05) and a CLI (2026-08) in twelve months; `rc webhooks trigger <EVENT>` is an obvious next step, and staff acknowledged the pick-an-event and resend requests in Dec 2025 "internally". What an official trigger would *not* replace: YAML scenarios with expectations, seeded determinism, offline mode, real-capture fixtures, the validating listener.
- **Fidelity drift.** Synthetic payloads can drift from RevenueCat's real schema (the reason `@puzzmo/revenue-cat-webhook-types` exists). The real-capture fixtures and `rcc tail` are the mitigation; keep capturing.
- **Relay half is commodity.** ngrok, Hookdeck, Svix Play, webhook.site, smee all forward webhooks; RC staff already point at ngrok. Keep `rcc tail`/`rcc inbox`, lead with the simulator.

## 8. Decisions taken from this research (2026-08-29)

- README repositioned: the tagline names the three stores; "the Stripe CLI that RevenueCat does not have" replaced by "`stripe trigger` + `stripe listen` for RevenueCat — what `rc` does not do"; a comparison table against the dashboard test event, sandbox/Test Store and `rc`; fidelity section leads with the real captures.
- Promotion tasks tracked in a local, git-ignored TODO (not part of the product).
- Icebox additions (candidate tickets, not scheduled): replay of captured fixtures (`rcc send --from <fixture>`), `PRODUCT_CHANGE`/`TRANSFER`/refund generation, exported TypeScript types for handlers.
