import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateExpectations, runScenario, type RunResult } from "../../src/core/engine.js";
import { parseScenario } from "../../src/core/scenario.js";
import { buildProgram } from "../../src/program.js";
import { RccError } from "../../src/core/errors.js";
import { Collector, startTestServer, type TestServer } from "../helpers/server.js";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.close());
beforeEach(() => {
  server.requests.length = 0;
  server.status = 200;
  server.delayMs = 0;
});

const SCENARIO = `name: exp
subscriber:
  trial: P1W
steps:
  - event: INITIAL_PURCHASE
    expect:
      response_status: 200
  - advance: P1W
  - event: RENEWAL
    expect:
      response_status: 201
expect:
  all_responses_status: 200
  max_response_ms: 150
`;

function file(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rcc-exp-"));
  const f = join(dir, "s.yaml");
  writeFileSync(f, content);
  return f;
}

async function cli(args: string[]): Promise<{ out: string; err: string; error?: RccError }> {
  const out = new Collector();
  const err = new Collector();
  const program = buildProgram({ stdout: out, stderr: err });
  program.exitOverride();
  try {
    await program.parseAsync(["node", "rcc", ...args]);
  } catch (e) {
    if (e instanceof RccError) return { out: out.text, err: err.text, error: e };
    throw e;
  }
  return { out: out.text, err: err.text };
}

describe("T-040 evaluateExpectations", () => {
  it("evaluates step and scenario expectations", async () => {
    const result: RunResult = await runScenario(parseScenario(SCENARIO), { to: server.url, speed: "instant", seed: 1 });
    const exps = result.expectations;
    expect(exps.map((e) => [e.scope, e.step, e.rule, e.ok])).toEqual([
      ["step", 0, "response_status", true],
      ["step", 2, "response_status", false], // expected 201, got 200
      ["scenario", null, "all_responses_status", true],
      ["scenario", null, "max_response_ms", true],
    ]);
    const failed = exps.find((e) => !e.ok)!;
    expect(failed.expected).toBe("201");
    expect(failed.actual).toBe("200");
    expect(result.ok).toBe(false);
  });

  it("all_responses_status and max_response_ms fail with the offending step", async () => {
    server.status = 500;
    server.delayMs = 200;
    const scenario = parseScenario("name: x\nsteps:\n  - event: TEST\nexpect:\n  all_responses_status: 200\n  max_response_ms: 50\n");
    const result = await runScenario(scenario, { to: server.url, speed: "instant" });
    const [all, max] = result.expectations;
    expect(all!.ok).toBe(false);
    expect(all!.actual).toMatch(/500/);
    expect(all!.actual).toMatch(/step 1/);
    expect(max!.ok).toBe(false);
    expect(max!.expected).toBe("≤ 50 ms");
    expect(max!.actual).toMatch(/\d+ ms \(step 1 TEST\)/);
  });

  it("no expectations → empty list, ok follows deliveries", async () => {
    const result = await runScenario(parseScenario("name: x\nsteps:\n  - event: TEST\n"), { to: server.url, speed: "instant" });
    expect(result.expectations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("dry-run marks status/latency expectations as skipped (ok)", async () => {
    const result = await runScenario(parseScenario(SCENARIO), { to: server.url, speed: "instant", dryRun: true });
    expect(result.expectations.every((e) => e.ok && e.actual === "skipped")).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("is a pure function of scenario + events", () => {
    const scenario = parseScenario("name: x\nsteps:\n  - event: TEST\n    expect:\n      response_status: 204\n");
    const events = [{ step: 0, type: "TEST" as const, virtualTime: "t", status: 204, latencyMs: 1, event: {} as never }];
    expect(evaluateExpectations(scenario, events)[0]!.ok).toBe(true);
  });
});

describe("T-040 rcc run exit codes and --json", () => {
  it("failed expectations → exit 1 with a line per failure; passing → exit 0", async () => {
    const { out, error } = await cli(["run", file(SCENARIO), "--to", server.url, "--seed", "1"]);
    expect(error).toBeInstanceOf(RccError);
    expect(error!.exitCode).toBe(1);
    expect(out).toMatch(/✖ expectation failed · step 3 RENEWAL · response_status: expected 201, got 200/);
    expect(out).toMatch(/3\/4 expectations passed/);

    const good = await cli(["run", file(SCENARIO.replace("201", "200")), "--to", server.url]);
    expect(good.error).toBeUndefined();
    expect(good.out).toMatch(/4\/4 expectations passed/);
  });

  it("--json prints exactly one parseable document on stdout; human output on stderr", async () => {
    const { out, err, error } = await cli(["run", file(SCENARIO), "--to", server.url, "--seed", "1", "--json"]);
    expect(error).toBeInstanceOf(RccError);
    const doc = JSON.parse(out) as RunResult;
    expect(doc.scenario).toBe("exp");
    expect(doc.seed).toBe(1);
    expect(doc.ok).toBe(false);
    expect(doc.events).toHaveLength(2);
    expect(doc.events[0]!.status).toBe(200);
    expect(doc.events[0]!.event.type).toBe("INITIAL_PURCHASE");
    expect(doc.expectations).toHaveLength(4);
    expect(err).toMatch(/expectation failed/);
    expect(out.trim().split("\n").filter((l) => l.startsWith("{"))).toHaveLength(1);
  });

  it("--json --dry-run reports status null and skipped expectations", async () => {
    const { out, error } = await cli(["run", file(SCENARIO), "--json", "--dry-run"]);
    expect(error).toBeUndefined();
    const doc = JSON.parse(out) as RunResult;
    expect(doc.events.every((e) => e.status === null)).toBe(true);
    expect(doc.expectations.every((e) => e.actual === "skipped")).toBe(true);
    expect(doc.ok).toBe(true);
  });

  it("--json on a transport error still exits 1 (error on stderr, no partial JSON)", async () => {
    const { out, error } = await cli(["run", file(SCENARIO), "--json", "--to", "http://127.0.0.1:1/webhook"]);
    expect(error).toBeInstanceOf(RccError);
    expect(out.trim()).toBe("");
  });
});
