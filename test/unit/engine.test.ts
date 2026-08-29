import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { runScenario, type RunResult } from "../../src/core/engine.js";
import { loadScenarioWithSource, parseScenario } from "../../src/core/scenario.js";
import { RccError } from "../../src/core/errors.js";
import { WebhookEnvelopeSchema } from "../../src/schemas/index.js";
import { startTestServer, type TestServer } from "../helpers/server.js";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.close());
beforeEach(() => {
  server.requests.length = 0;
  server.status = 200;
});

const TRIAL_RECOVERS = `
name: trial-billing-issue-recovers
subscriber:
  period: P1M
  trial: P1W
steps:
  - event: INITIAL_PURCHASE
  - advance: P1W
  - event: RENEWAL
  - advance: P1M
  - event: BILLING_ISSUE
  - advance: P3D
  - event: RENEWAL
`;

describe("T-031 runScenario", () => {
  it("executes steps, posts each event and records virtual time, status and latency", async () => {
    const scenario = parseScenario(TRIAL_RECOVERS);
    const seen: string[] = [];
    const result: RunResult = await runScenario(scenario, {
      to: server.url,
      speed: "instant",
      seed: 1,
      onEvent: (r) => seen.push(r.type),
    });
    expect(result.events.map((e) => e.type)).toEqual(["INITIAL_PURCHASE", "RENEWAL", "BILLING_ISSUE", "RENEWAL"]);
    expect(seen).toEqual(result.events.map((e) => e.type));
    expect(result.events.map((e) => e.step)).toEqual([0, 2, 4, 6]);
    expect(result.events.map((e) => e.virtualTime)).toEqual([
      "2025-01-01T00:00:00.000Z",
      "2025-01-08T00:00:00.000Z",
      "2025-02-08T00:00:00.000Z",
      "2025-02-11T00:00:00.000Z",
    ]);
    for (const e of result.events) {
      expect(e.status).toBe(200);
      expect(e.latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(server.requests).toHaveLength(4);
    expect(WebhookEnvelopeSchema.parse(server.requests[2]!.body).event.type).toBe("BILLING_ISSUE");
    expect(result.ok).toBe(true);
    expect(result.virtualSpanMs).toBe(Date.UTC(2025, 1, 11) - Date.UTC(2025, 0, 1));
    expect(result.startedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(result.endedAt).toBe("2025-02-11T00:00:00.000Z");
    expect(result.seed).toBe(1);
  });

  it("dry-run posts nothing and reports status null", async () => {
    const result = await runScenario(parseScenario(TRIAL_RECOVERS), { to: server.url, speed: "instant", dryRun: true });
    expect(server.requests).toHaveLength(0);
    expect(result.events.every((e) => e.status === null && e.latencyMs === null)).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("same seed → identical payloads; unseeded → different ids", async () => {
    const a = await runScenario(parseScenario(TRIAL_RECOVERS), { to: server.url, speed: "instant", seed: "x", dryRun: true });
    const b = await runScenario(parseScenario(TRIAL_RECOVERS), { to: server.url, speed: "instant", seed: "x", dryRun: true });
    expect(JSON.stringify(a.events.map((e) => e.event))).toBe(JSON.stringify(b.events.map((e) => e.event)));
    const c = await runScenario(parseScenario(TRIAL_RECOVERS), { to: server.url, speed: "instant", dryRun: true });
    expect(c.events[0]!.event.id).not.toBe(a.events[0]!.event.id);
    expect(c.seed).toBeNull();
  });

  it("non-2xx responses are recorded and make ok=false without aborting", async () => {
    server.status = 500;
    const result = await runScenario(parseScenario(TRIAL_RECOVERS), { to: server.url, speed: "instant", seed: 1 });
    expect(result.events).toHaveLength(4);
    expect(result.events.every((e) => e.status === 500)).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("an illegal transition stops the run naming step index and file:line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rcc-run-"));
    const file = join(dir, "bad.yaml");
    writeFileSync(file, "name: bad\nsteps:\n  - event: INITIAL_PURCHASE\n  - advance: P1D\n  - event: UNCANCELLATION\n");
    const loaded = loadScenarioWithSource(file);
    expect(loaded.stepPositions.map((p) => p.line)).toEqual([3, 4, 5]);
    await expect(
      runScenario(loaded.scenario, { to: server.url, speed: "instant", dryRun: true, source: loaded }),
    ).rejects.toThrow(/step 3 \(.*bad\.yaml:5\).*UNCANCELLATION/);
    expect(server.requests).toHaveLength(0);
  });

  it("a premature EXPIRATION is reported with the advance hint", async () => {
    const scenario = parseScenario("name: early\nsteps:\n  - event: INITIAL_PURCHASE\n  - event: CANCELLATION\n  - event: EXPIRATION\n");
    await expect(runScenario(scenario, { to: server.url, speed: "instant", dryRun: true })).rejects.toThrow(/advance: P31D/);
  });

  it("unreachable endpoint fails with the actionable message", async () => {
    const scenario = parseScenario("name: x\nsteps:\n  - event: TEST\n");
    await expect(runScenario(scenario, { to: "http://127.0.0.1:1/webhook", speed: "instant" })).rejects.toThrow(RccError);
    await expect(runScenario(scenario, { to: "http://127.0.0.1:1/webhook", speed: "instant" })).rejects.toThrow(/rcc listen/);
  });

  it("--speed <ms> waits between events", async () => {
    const scenario = parseScenario("name: x\nsteps:\n  - event: TEST\n  - event: TEST\n  - event: TEST\n");
    const t0 = Date.now();
    await runScenario(scenario, { to: server.url, speed: 60, dryRun: true });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(100);
  });

  it("applies subscriber config (fixed user, product, environment) and step-level set overrides", async () => {
    const scenario = parseScenario(
      "name: cfg\nsubscriber:\n  app_user_id: u1\n  product_id: com.x.y\n  environment: PRODUCTION\nsteps:\n  - event: INITIAL_PURCHASE\n    set:\n      price: 1.5\n",
    );
    const r = await runScenario(scenario, { to: server.url, speed: "instant", dryRun: true });
    const ev = r.events[0]!.event;
    expect(ev.app_user_id).toBe("u1");
    expect(ev.product_id).toBe("com.x.y");
    expect(ev.environment).toBe("PRODUCTION");
    expect(ev.price).toBe(1.5);
  });
});
