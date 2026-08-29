import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { runScenario } from "../../src/core/engine.js";
import { loadScenarioWithSource } from "../../src/core/scenario.js";
import { EventSchema } from "../../src/schemas/index.js";

const DIR = join(import.meta.dirname, "../../scenarios");

/** Expected event sequence per shipped scenario (see specs/F3-scenarios.md). */
const EXPECTED: Record<string, string[]> = {
  "trial-converts": ["INITIAL_PURCHASE", "RENEWAL", "RENEWAL"],
  "trial-churns": ["INITIAL_PURCHASE", "CANCELLATION", "EXPIRATION"],
  "billing-issue-recovers": ["INITIAL_PURCHASE", "RENEWAL", "BILLING_ISSUE", "RENEWAL"],
  "billing-issue-churns": ["INITIAL_PURCHASE", "RENEWAL", "BILLING_ISSUE", "EXPIRATION"],
  "cancel-then-uncancel": ["INITIAL_PURCHASE", "CANCELLATION", "UNCANCELLATION", "RENEWAL"],
  "happy-year": ["INITIAL_PURCHASE", ...Array<string>(12).fill("RENEWAL")],
};

describe("T-032 shipped example scenarios", () => {
  it("ships exactly the six documented scenarios", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".yaml")).sort();
    expect(files).toEqual(Object.keys(EXPECTED).sort().map((n) => `${n}.yaml`));
  });

  it.each(Object.keys(EXPECTED))("%s parses, runs legally and matches the documented sequence", async (name) => {
    const loaded = loadScenarioWithSource(join(DIR, `${name}.yaml`));
    expect(loaded.scenario.name).toBe(name);
    expect(loaded.scenario.description?.length ?? 0).toBeGreaterThan(20);
    const result = await runScenario(loaded.scenario, { to: "http://unused", speed: "instant", seed: 1, dryRun: true, source: loaded });
    expect(result.events.map((e) => e.type)).toEqual(EXPECTED[name]);
    for (const e of result.events) expect(EventSchema.safeParse(e.event).success).toBe(true);
    expect(loaded.scenario.expect?.all_responses_status).toBe(200);
  });

  it("happy-year spans one virtual year with 13 events", async () => {
    const loaded = loadScenarioWithSource(join(DIR, "happy-year.yaml"));
    const r = await runScenario(loaded.scenario, { to: "http://unused", speed: "instant", seed: 1, dryRun: true });
    expect(r.events).toHaveLength(13);
    expect(r.startedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(r.endedAt).toBe("2026-01-01T00:00:00.000Z");
    const last = r.events.at(-1)!.event;
    expect(last.expiration_at_ms).toBe(Date.UTC(2026, 1, 1));
  });

  it("billing-issue-churns expires with BILLING_ERROR; trial-churns with UNSUBSCRIBE", async () => {
    const churn = await runScenario(loadScenarioWithSource(join(DIR, "billing-issue-churns.yaml")).scenario, { to: "x", speed: "instant", dryRun: true });
    const exp = churn.events.at(-1)!.event;
    expect(exp.type === "EXPIRATION" && exp.expiration_reason).toBe("BILLING_ERROR");
    const trial = await runScenario(loadScenarioWithSource(join(DIR, "trial-churns.yaml")).scenario, { to: "x", speed: "instant", dryRun: true });
    const texp = trial.events.at(-1)!.event;
    expect(texp.type === "EXPIRATION" && texp.expiration_reason).toBe("UNSUBSCRIBE");
    expect(texp.period_type).toBe("TRIAL");
  });
});
