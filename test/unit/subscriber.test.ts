import { describe, expect, it } from "vitest";
import { VirtualClock, addDuration, parseDuration } from "../../src/core/clock.js";
import { createRng } from "../../src/core/rng.js";
import { IllegalTransitionError } from "../../src/core/state-machine.js";
import { PrematureEventError, Subscriber, type SubscriberOptions } from "../../src/core/subscriber.js";
import { EventSchema } from "../../src/schemas/index.js";
import type { Event } from "../../src/schemas/index.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const P1M = parseDuration("P1M");

function make(over: Partial<SubscriberOptions> = {}, seed: number | string = 42): { sub: Subscriber; clock: VirtualClock } {
  const clock = VirtualClock.forSeed(seed);
  const sub = new Subscriber(
    {
      appUserId: "auto",
      productId: "com.example.premium.monthly",
      period: "P1M",
      trial: "P1W",
      gracePeriod: "P16D",
      store: "app_store",
      environment: "SANDBOX",
      ...over,
    },
    { clock, rng: createRng(seed) },
  );
  return { sub, clock };
}

/** trial → convert → renew → billing issue → recover */
function lifecycle(): { events: Event[]; sub: Subscriber; clock: VirtualClock } {
  const { sub, clock } = make();
  const events: Event[] = [];
  events.push(sub.emit("INITIAL_PURCHASE"));
  clock.advance("P1W");
  events.push(sub.emit("RENEWAL"));
  clock.advance("P1M");
  events.push(sub.emit("RENEWAL"));
  clock.advance("P1M");
  events.push(sub.emit("BILLING_ISSUE"));
  clock.advance("P3D");
  events.push(sub.emit("RENEWAL"));
  return { events, sub, clock };
}

describe("T-011 coherence rules", () => {
  it("rule 1: identity is shared; renewals get fresh transaction ids linked to the original", () => {
    const { events } = lifecycle();
    const ids = new Set(events.map((e) => `${e.app_user_id}|${e.original_transaction_id}|${e.product_id}`));
    expect(ids.size).toBe(1);
    const first = events[0]!;
    expect(first.transaction_id).toBe(first.original_transaction_id);
    const renewals = events.filter((e) => e.type === "RENEWAL");
    expect(new Set(renewals.map((e) => e.transaction_id)).size).toBe(renewals.length);
    for (const r of renewals) {
      expect(r.transaction_id).not.toBe(first.transaction_id);
      expect(r.original_transaction_id).toBe(first.original_transaction_id);
    }
    expect(first.original_app_user_id).toBe(first.app_user_id);
    expect(first.aliases).toEqual([first.app_user_id]);
  });

  it("rule 2: timestamps only move forward and periods are consistent with the product", () => {
    const { events } = lifecycle();
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.event_timestamp_ms).toBeGreaterThanOrEqual(events[i - 1]!.event_timestamp_ms);
    }
    for (const e of events) {
      expect(e.purchased_at_ms).toBeLessThan(e.expiration_at_ms!);
      const expectedLen = e.period_type === "TRIAL" ? parseDuration("P1W") : P1M;
      expect(e.expiration_at_ms).toBe(addDuration(e.purchased_at_ms!, expectedLen));
    }
    expect(events[0]!.purchased_at_ms).toBe(events[0]!.event_timestamp_ms);
  });

  it("rule 3: period_type is TRIAL during the trial and NORMAL afterwards", () => {
    const { sub, clock } = make();
    const ip = sub.emit("INITIAL_PURCHASE");
    expect(ip.period_type).toBe("TRIAL");
    expect(ip.price).toBe(0);
    expect(sub.state).toBe("trial");
    const cancel = sub.emit("CANCELLATION");
    expect(cancel.period_type).toBe("TRIAL");
    sub.emit("UNCANCELLATION");
    expect(sub.state).toBe("trial");
    clock.advance("P1W");
    const conv = sub.emit("RENEWAL");
    expect(conv.period_type).toBe("NORMAL");
    expect(conv.type === "RENEWAL" && conv.is_trial_conversion).toBe(true);
    expect(conv.price).toBeGreaterThan(0);
    clock.advance("P1M");
    const ren = sub.emit("RENEWAL");
    expect(ren.type === "RENEWAL" && ren.is_trial_conversion).toBe(false);
    expect(ren.period_type).toBe("NORMAL");
  });

  it("rule 3b: without a trial, INITIAL_PURCHASE is NORMAL and goes straight to active", () => {
    const { sub } = make({ trial: undefined });
    const ip = sub.emit("INITIAL_PURCHASE");
    expect(ip.period_type).toBe("NORMAL");
    expect(ip.expiration_at_ms).toBe(addDuration(ip.purchased_at_ms!, P1M));
    expect(sub.state).toBe("active");
  });

  it("rule 4: a RENEWAL extends expiration_at_ms by exactly one period", () => {
    const { events } = lifecycle();
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]!;
      const cur = events[i]!;
      if (cur.type === "RENEWAL") {
        expect(cur.purchased_at_ms).toBe(prev.expiration_at_ms);
        expect(cur.expiration_at_ms).toBe(addDuration(prev.expiration_at_ms!, P1M));
      }
    }
  });

  it("rule 5: CANCELLATION keeps access; EXPIRATION waits for the clock", () => {
    const { sub, clock } = make({ trial: undefined });
    const ip = sub.emit("INITIAL_PURCHASE");
    clock.advance("P10D");
    const cancel = sub.emit("CANCELLATION");
    expect(cancel.type === "CANCELLATION" && cancel.cancel_reason).toBe("UNSUBSCRIBE");
    expect(cancel.expiration_at_ms).toBe(ip.expiration_at_ms);
    expect(sub.state).toBe("cancelled_pending_expiration");
    expect(() => sub.emit("EXPIRATION")).toThrow(PrematureEventError);
    expect(() => sub.emit("EXPIRATION")).toThrow(/advance/);
    expect(sub.history).toHaveLength(2);
    clock.advance("P21D");
    const exp = sub.emit("EXPIRATION");
    expect(exp.type === "EXPIRATION" && exp.expiration_reason).toBe("UNSUBSCRIBE");
    expect(exp.expiration_at_ms).toBe(ip.expiration_at_ms);
    expect(sub.state).toBe("expired");
  });

  it("rule 6: BILLING_ISSUE opens a grace period; RENEWAL recovers, EXPIRATION churns with BILLING_ERROR", () => {
    const { sub, clock } = make({ trial: undefined, gracePeriod: "P16D" });
    sub.emit("INITIAL_PURCHASE");
    clock.advance("P1M");
    const bi = sub.emit("BILLING_ISSUE");
    expect(bi.type).toBe("BILLING_ISSUE");
    if (bi.type !== "BILLING_ISSUE") throw new Error();
    expect(bi.grace_period_expiration_at_ms).toBe(addDuration(clock.now(), parseDuration("P16D")));
    expect(sub.state).toBe("billing_issue");
    expect(() => sub.emit("EXPIRATION")).toThrow(PrematureEventError);
    clock.advance("P3D");
    const rec = sub.emit("RENEWAL");
    expect(rec.type).toBe("RENEWAL");
    expect(sub.state).toBe("active");

    // churn path
    const churn = make({ trial: undefined });
    churn.sub.emit("INITIAL_PURCHASE");
    churn.clock.advance("P1M");
    churn.sub.emit("BILLING_ISSUE");
    churn.clock.advance("P16D");
    const exp = churn.sub.emit("EXPIRATION");
    expect(exp.type === "EXPIRATION" && exp.expiration_reason).toBe("BILLING_ERROR");
    expect(churn.sub.state).toBe("expired");
  });

  it("rule 6b: cancelling from a billing issue carries cancel_reason BILLING_ERROR", () => {
    const { sub, clock } = make({ trial: undefined });
    sub.emit("INITIAL_PURCHASE");
    clock.advance("P1M");
    sub.emit("BILLING_ISSUE");
    const c = sub.emit("CANCELLATION");
    expect(c.type === "CANCELLATION" && c.cancel_reason).toBe("BILLING_ERROR");
  });

  it("rule 7: unique UUID ids, configured environment and store", () => {
    const { events } = lifecycle();
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of events) {
      expect(e.id).toMatch(UUID_V4);
      expect(e.environment).toBe("SANDBOX");
      expect(e.store).toBe("APP_STORE");
    }
    const prod = make({ environment: "PRODUCTION" });
    expect(prod.sub.emit("INITIAL_PURCHASE").environment).toBe("PRODUCTION");
  });

  it("rule 8: an illegal transition throws before any payload is produced", () => {
    const { sub } = make();
    expect(() => sub.emit("RENEWAL")).toThrow(IllegalTransitionError);
    expect(sub.history).toHaveLength(0);
    expect(sub.state).toBe("none");
    sub.emit("INITIAL_PURCHASE");
    expect(() => sub.emit("UNCANCELLATION")).toThrow(IllegalTransitionError);
    expect(sub.history).toHaveLength(1);
    expect(sub.state).toBe("trial");
  });
});

describe("T-011 payload validity, overrides, determinism", () => {
  it("every generated event validates against EventSchema", () => {
    const { events, sub } = lifecycle();
    events.push(sub.emit("TEST"));
    for (const e of events) expect(EventSchema.safeParse(e).success, e.type).toBe(true);
  });

  it("TEST does not change state and is purchase-like even before any purchase", () => {
    const { sub } = make();
    const t = sub.emit("TEST");
    expect(t.type).toBe("TEST");
    expect(t.product_id).toBe("com.example.premium.monthly");
    expect(sub.state).toBe("none");
    expect(sub.history).toHaveLength(1);
  });

  it("applies dot-path overrides and rejects schema-invalid results naming the path", () => {
    const { sub } = make();
    const e = sub.emit("INITIAL_PURCHASE", { price: 4.99, "subscriber_attributes.plan.value": "pro", "subscriber_attributes.plan.updated_at_ms": 1 });
    expect(e.price).toBe(4.99);
    expect(e.subscriber_attributes).toEqual({ plan: { value: "pro", updated_at_ms: 1 } });
    expect(() => sub.emit("CANCELLATION", { cancel_reason: "NOPE" })).toThrow(/cancel_reason/);
    expect(sub.history).toHaveLength(1);
  });

  it("fixed app_user_id is honoured; auto generates a RevenueCat-style anonymous id", () => {
    expect(make({ appUserId: "user_123" }).sub.emit("TEST").app_user_id).toBe("user_123");
    expect(make().sub.emit("TEST").app_user_id).toMatch(/^\$RCAnonymousID:[0-9a-f]{32}$/);
  });

  it("same seed → identical payloads; different seed → different ids", () => {
    const a = lifecycle().events;
    const b = lifecycle().events;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = make({}, 7).sub.emit("INITIAL_PURCHASE");
    expect(c.id).not.toBe(a[0]!.id);
    expect(c.app_user_id).not.toBe(a[0]!.app_user_id);
  });

  it("resubscribing after expiration keeps the original_transaction_id and skips the trial", () => {
    const { sub, clock } = make();
    const first = sub.emit("INITIAL_PURCHASE");
    sub.emit("CANCELLATION");
    clock.advance("P1W");
    sub.emit("EXPIRATION");
    clock.advance("P2M");
    const again = sub.emit("INITIAL_PURCHASE");
    expect(again.period_type).toBe("NORMAL");
    expect(again.original_transaction_id).toBe(first.original_transaction_id);
    expect(again.transaction_id).not.toBe(first.transaction_id);
    expect(sub.state).toBe("active");
  });
});
