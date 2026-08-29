# Real captured events

Payloads received from RevenueCat itself (not from the docs), captured with `rcc tail --smee --forward` → `rcc listen --verbose`.

| File | Captured | How | Notes |
|------|----------|-----|-------|
| `TEST.json` | 2026-08-29 | Dashboard → Integrations → Webhooks → send test event (project `mytestapp`, sandbox) | `store: PLAY_STORE`; 15 lifecycle keys present with `null` (`transaction_id`, `original_transaction_id`, `is_family_share`, prices, `renewal_number`, `metadata`…); `id` is an upper-case UUID; subscriber attributes are RevenueCat's own dummy data. |
