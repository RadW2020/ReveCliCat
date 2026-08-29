/**
 * Minimal, idempotent RevenueCat webhook handler (reference implementation).
 *
 *   PORT=3000 RC_WEBHOOK_AUTH="Bearer dev" npx tsx examples/express-handler.ts
 *   rcc run scenarios/trial-churns.yaml --auth-header "Bearer dev"
 *
 * What it does — and what yours should do too:
 *   1. Check the Authorization header against the value you configured in the RevenueCat dashboard
 *      (RevenueCat sends it verbatim; there is no signature).
 *   2. Validate the body with the schemas from `reveclicat` (400 on anything unexpected).
 *   3. Dedupe by `event.id` — RevenueCat delivers at-least-once and retries reuse the same id.
 *   4. Answer 200 fast; do the real work after responding (RevenueCat disconnects after 60 s).
 *
 * Unofficial project — not affiliated with RevenueCat, Inc.
 */
import express, { type Express, type Request, type Response } from "express";
import { WebhookEnvelopeSchema, type Event } from "reveclicat";

export interface HandlerOptions {
  /** Expected Authorization header. Omit to accept every request (local dev only!). */
  authHeader?: string | undefined;
  /** Called once per *new* event. Replace with your business logic. */
  onEvent?: ((event: Event) => void | Promise<void>) | undefined;
}

export function createApp(opts: HandlerOptions): Express {
  const app = express();
  // In production use a bounded store (Redis SET with TTL, a DB unique index, ...). RevenueCat retries for ~2.5 h.
  const seen = new Set<string>();

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Keep the raw body: JSON parse errors must become a 400, not a 500.
  app.post("/webhook", express.text({ type: "*/*", limit: "1mb" }), (req: Request, res: Response) => {
    if (opts.authHeader !== undefined && req.header("authorization") !== opts.authHeader) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(typeof req.body === "string" ? req.body : "");
    } catch {
      res.status(400).json({ error: "Body is not valid JSON" });
      return;
    }

    const parsed = WebhookEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid RevenueCat webhook envelope",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }

    const { event } = parsed.data;
    if (seen.has(event.id)) {
      res.json({ ok: true, deduped: true });
      return;
    }
    seen.add(event.id);

    // Respond first, process after — RevenueCat only needs the 200.
    res.json({ ok: true });
    void Promise.resolve(opts.onEvent?.(event)).catch((err: unknown) => {
      console.error(`[webhook] failed to process ${event.type} ${event.id}:`, err);
    });
  });

  return app;
}

// Run directly: `npx tsx examples/express-handler.ts`
const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const port = Number(process.env["PORT"] ?? 3000);
  const app = createApp({
    authHeader: process.env["RC_WEBHOOK_AUTH"],
    onEvent: (event) => {
      console.log(`[webhook] ${event.type.padEnd(16)} ${event.app_user_id}  ${event.product_id ?? ""}`);
    },
  });
  app.listen(port, () => {
    console.log(`Reference handler listening on http://localhost:${port}/webhook`);
    if (process.env["RC_WEBHOOK_AUTH"] === undefined) console.log("  (no RC_WEBHOOK_AUTH set — accepting every request)");
  });
}
