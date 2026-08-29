import { describe, expect, it } from "vitest";
import { VirtualClock, addDuration, parseDuration } from "../../src/core/clock.js";
import { createRng } from "../../src/core/rng.js";
import { Subscriber, type SubscriberOptions } from "../../src/core/subscriber.js";
import { EventSchema } from "../../src/schemas/index.js";
import { parseScenario } from "../../src/core/scenario.js";
import { runScenario } from "../../src/core/engine.js";
import { parseStore } from "../../src/commands/send.js";
import type { RccError } from "../../src/core/errors.js";

const GPA = /^GPA\.\d{4}-\d{4}-\d{4}-\d{5}$/;

function make(over: Partial<SubscriberOptions> = {}, seed = 42): { sub: Subscriber; clock: VirtualClock } {
  const clock = VirtualClock.forSeed(seed);
  const sub = new Subscriber({ productId: "com.example.premium:monthly", period: "P1M", trial: "P1W", store: "play_store", ...over }, { clock, rng: createRng(seed) });
  return { sub, clock };
}

describe("T-071 play_store identifiers", () => {
  it("initial purchase uses a GPA order id for both transaction ids and store PLAY_STORE", () => {
    const { sub } = make();
    const ip = sub.emit("INITIAL_PURCHASE");
    expect(ip.store).toBe("PLAY_STORE");
    expect(ip.transaction_id).toMatch(GPA);
    expect(ip.original_transaction_id).toBe(ip.transaction_id);
    expect(ip.is_family_share).toBe(false);
    expect(ip.period_type).toBe("TRIAL");
  });

  it("renewals append ..0, ..1, … to the original order id; original stays", () => {
    const { sub, clock } = make();
    const ip = sub.emit("INITIAL_PURCHASE");
    clock.advance("P1W");
    const conv = sub.emit("RENEWAL");
    clock.advance("P1M");
    const r2 = sub.emit("RENEWAL");
    clock.advance("P1M");
    sub.emit("BILLING_ISSUE");
    clock.advance("P2D");
    const r3 = sub.emit("RENEWAL");
    expect(conv.transaction_id).toBe(`${ip.transaction_id}..0`);
    expect(r2.transaction_id).toBe(`${ip.transaction_id}..1`);
    expect(r3.transaction_id).toBe(`${ip.transaction_id}..2`);
    for (const e of [conv, r2, r3]) expect(e.original_transaction_id).toBe(ip.original_transaction_id);
    expect(r2.expiration_at_ms).toBe(addDuration(conv.expiration_at_ms!, parseDuration("P1M")));
  });

  it("resubscribing after expiry starts a new GPA order that becomes the original", () => {
    const { sub, clock } = make();
    const first = sub.emit("INITIAL_PURCHASE");
    sub.emit("CANCELLATION");
    clock.advance("P1W");
    sub.emit("EXPIRATION");
    clock.advance("P1M");
    const again = sub.emit("INITIAL_PURCHASE");
    expect(again.transaction_id).toMatch(GPA);
    expect(again.transaction_id).not.toBe(first.transaction_id);
    expect(again.original_transaction_id).toBe(again.transaction_id);
    clock.advance("P1M");
    expect(sub.emit("RENEWAL").transaction_id).toBe(`${again.transaction_id}..0`);
  });

  it("app_store is unchanged: numeric ids, original kept on resubscribe", () => {
    const { sub, clock } = make({ store: "app_store", productId: "com.example.premium.monthly" });
    const ip = sub.emit("INITIAL_PURCHASE");
    expect(ip.store).toBe("APP_STORE");
    expect(ip.transaction_id).toMatch(/^\d{16}$/);
    clock.advance("P1W");
    const r = sub.emit("RENEWAL");
    expect(r.transaction_id).toMatch(/^\d{16}$/);
    expect(r.transaction_id).not.toContain("..");
  });

  it("every Play event validates and a seeded sequence is deterministic", () => {
    const run = (): string => {
      const { sub, clock } = make({}, 7);
      const out = [sub.emit("INITIAL_PURCHASE")];
      clock.advance("P1W");
      out.push(sub.emit("RENEWAL"));
      clock.advance("P1M");
      out.push(sub.emit("CANCELLATION"), sub.emit("UNCANCELLATION"));
      clock.advance("P1M");
      out.push(sub.emit("RENEWAL"), sub.emit("TEST"));
      for (const e of out) expect(EventSchema.safeParse(e).success, e.type).toBe(true);
      return JSON.stringify(out);
    };
    expect(run()).toBe(run());
  });
});

describe("T-072 play_store on the surface", () => {
  it("parseStore accepts play_store and lists both stores on error", () => {
    expect(parseStore("play_store")).toBe("play_store");
    try {
      parseStore("amazon");
      throw new Error("expected");
    } catch (e) {
      expect((e as RccError).message).toMatch(/app_store, play_store, stripe/);
    }
  });

  it("scenario subscriber.store: play_store runs with Play ids and the Play default product id", async () => {
    const scenario = parseScenario("name: p\nsubscriber:\n  store: play_store\n  trial: P1W\nsteps:\n  - event: INITIAL_PURCHASE\n  - advance: P1W\n  - event: RENEWAL\n");
    const r = await runScenario(scenario, { to: "x", speed: "instant", dryRun: true, seed: 1 });
    expect(r.events[0]!.event.store).toBe("PLAY_STORE");
    expect(r.events[0]!.event.product_id).toBe("com.example.premium:monthly");
    expect(r.events[1]!.event.transaction_id).toMatch(/\.\.0$/);
    const explicit = parseScenario("name: p\nsubscriber:\n  store: play_store\n  product_id: sub_gold:annual\nsteps:\n  - event: INITIAL_PURCHASE\n");
    const r2 = await runScenario(explicit, { to: "x", speed: "instant", dryRun: true, seed: 1 });
    expect(r2.events[0]!.event.product_id).toBe("sub_gold:annual");
  });
});
