import { describe, expect, it } from "vitest";
import { VirtualClock, addDuration, parseDuration } from "../../src/core/clock.js";
import { createRng } from "../../src/core/rng.js";
import { Subscriber, type SubscriberOptions } from "../../src/core/subscriber.js";
import { IllegalTransitionError, legalEvents } from "../../src/core/state-machine.js";
import { EventSchema } from "../../src/schemas/index.js";
import { parseScenario } from "../../src/core/scenario.js";
import { runScenario } from "../../src/core/engine.js";
import { parseStore } from "../../src/commands/send.js";

const SI = /^si_[A-Za-z0-9]{14}$/;
const P1M = parseDuration("P1M");

function make(over: Partial<SubscriberOptions> = {}, seed = 42): { sub: Subscriber; clock: VirtualClock } {
  const clock = VirtualClock.forSeed(seed);
  const sub = new Subscriber({ period: "P1M", trial: "P1W", store: "stripe", ...over }, { clock, rng: createRng(seed) });
  return { sub, clock };
}

describe("T-082 stripe store in the generator", () => {
  it("INITIAL_PURCHASE: STRIPE, si_ ids, prod_ default product, renewal_number 1, Stripe money fields, country null", () => {
    const { sub } = make();
    const ip = sub.emit("INITIAL_PURCHASE");
    expect(ip.store).toBe("STRIPE");
    expect(ip.transaction_id).toMatch(SI);
    expect(ip.original_transaction_id).toBe(ip.transaction_id);
    expect(ip.product_id).toMatch(/^prod_/);
    expect(ip.renewal_number).toBe(1);
    expect(ip.country_code).toBeNull();
    expect(ip.commission_percentage).toBe(0);
    expect(ip.takehome_percentage).toBe(1);
    expect(ip.is_family_share).toBe(false);
    expect(ip.period_type).toBe("TRIAL");
  });

  it("the captured lifecycle: ids never change, renewal_number counts the failed attempt, recovery does not re-extend", () => {
    const { sub, clock } = make();
    const ip = sub.emit("INITIAL_PURCHASE");
    clock.advance("P1W");
    const conv = sub.emit("RENEWAL");
    expect(conv.transaction_id).toBe(ip.transaction_id);
    expect(conv.type === "RENEWAL" && conv.is_trial_conversion).toBe(true);
    expect(conv.renewal_number).toBe(2);
    clock.advance("P1M");
    const bi = sub.emit("BILLING_ISSUE");
    expect(bi.type === "BILLING_ISSUE" && bi.grace_period_expiration_at_ms).toBeNull();
    expect(bi.expiration_at_ms).toBe(addDuration(conv.expiration_at_ms!, P1M)); // extended at the failed attempt
    expect(bi.renewal_number).toBe(3);
    const cancel = sub.emit("CANCELLATION");
    expect(cancel.type === "CANCELLATION" && cancel.cancel_reason).toBe("BILLING_ERROR");
    expect(cancel.expiration_at_ms).toBe(bi.expiration_at_ms);
    expect(sub.state).toBe("cancelled_pending_expiration");
  });

  it("recovery RENEWAL from billing_issue keeps expiration and renewal_number", () => {
    const { sub, clock } = make({ trial: undefined });
    sub.emit("INITIAL_PURCHASE");
    clock.advance("P1M");
    const bi = sub.emit("BILLING_ISSUE");
    clock.advance("P2D");
    const rec = sub.emit("RENEWAL");
    expect(rec.expiration_at_ms).toBe(bi.expiration_at_ms);
    expect(rec.renewal_number).toBe(bi.renewal_number);
    expect(rec.type === "RENEWAL" && rec.is_trial_conversion).toBe(false);
    expect(rec.transaction_id).toBe(bi.transaction_id);
  });

  it("UNCANCELLATION and TEST are illegal for Stripe with a store-specific message", () => {
    const { sub } = make({ trial: undefined });
    sub.emit("INITIAL_PURCHASE");
    sub.emit("CANCELLATION");
    expect(() => sub.emit("UNCANCELLATION")).toThrow(IllegalTransitionError);
    expect(() => sub.emit("UNCANCELLATION")).toThrow(/Stripe does not emit UNCANCELLATION/);
    expect(() => sub.emit("TEST")).toThrow(/Stripe does not emit TEST/);
    expect(sub.history).toHaveLength(2);
    expect(legalEvents("cancelled_pending_expiration", "stripe")).toEqual(["RENEWAL", "EXPIRATION"]);
    expect(legalEvents("none", "stripe")).toEqual(["INITIAL_PURCHASE"]);
    expect(legalEvents("none")).toEqual(["INITIAL_PURCHASE", "TEST"]);
  });

  it("resubscribing after expiry mints a new si_ id; App Store/Play unchanged (no renewal_number)", () => {
    const { sub, clock } = make({ trial: undefined });
    const first = sub.emit("INITIAL_PURCHASE");
    sub.emit("CANCELLATION");
    clock.advance("P1M");
    sub.emit("EXPIRATION");
    const again = sub.emit("INITIAL_PURCHASE");
    expect(again.transaction_id).toMatch(SI);
    expect(again.transaction_id).not.toBe(first.transaction_id);
    expect(again.renewal_number).toBe(1);
    const apple = make({ store: "app_store", trial: undefined }).sub.emit("INITIAL_PURCHASE");
    expect(apple.renewal_number).toBeUndefined();
    expect(apple.country_code).toBe("US");
  });

  it("every Stripe event validates; seeded runs are deterministic", () => {
    const run = (): string => {
      const { sub, clock } = make({}, 9);
      const out = [sub.emit("INITIAL_PURCHASE")];
      clock.advance("P1W");
      out.push(sub.emit("RENEWAL"));
      clock.advance("P1M");
      out.push(sub.emit("BILLING_ISSUE"), sub.emit("CANCELLATION"));
      clock.advance("P1M");
      out.push(sub.emit("EXPIRATION"));
      for (const e of out) expect(EventSchema.safeParse(e).success, e.type).toBe(true);
      return JSON.stringify(out);
    };
    expect(run()).toBe(run());
  });
});

describe("T-083 stripe on the surface", () => {
  it("parseStore accepts stripe and lists the three stores", () => {
    expect(parseStore("stripe")).toBe("stripe");
    expect(() => parseStore("amazon")).toThrow(/app_store, play_store, stripe/);
  });
  it("a scenario with store: stripe runs and fails clearly on UNCANCELLATION", async () => {
    const ok = parseScenario("name: s\nsubscriber:\n  store: stripe\nsteps:\n  - event: INITIAL_PURCHASE\n  - advance: P1M\n  - event: BILLING_ISSUE\n  - advance: P3D\n  - event: RENEWAL\n");
    const r = await runScenario(ok, { to: "x", speed: "instant", dryRun: true, seed: 1 });
    expect(r.events.map((e) => e.type)).toEqual(["INITIAL_PURCHASE", "BILLING_ISSUE", "RENEWAL"]);
    expect(r.events[0]!.event.store).toBe("STRIPE");
    const bad = parseScenario("name: s\nsubscriber:\n  store: stripe\nsteps:\n  - event: INITIAL_PURCHASE\n  - event: CANCELLATION\n  - event: UNCANCELLATION\n");
    await expect(runScenario(bad, { to: "x", speed: "instant", dryRun: true })).rejects.toThrow(/step 3.*Stripe does not emit UNCANCELLATION/);
  });
});
