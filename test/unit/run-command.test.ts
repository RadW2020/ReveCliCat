import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});

function scenarioFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rcc-runcmd-"));
  const file = join(dir, "s.yaml");
  writeFileSync(file, content);
  return file;
}

async function run(args: string[]): Promise<{ out: string; err: string; error?: RccError }> {
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

const TRIAL_CHURNS = `name: trial-churns
description: Trial starts, user cancels, access ends at trial expiry
subscriber:
  trial: P1W
steps:
  - event: INITIAL_PURCHASE
  - advance: P2D
  - event: CANCELLATION
  - advance: P5D
  - event: EXPIRATION
`;

describe("T-031 rcc run", () => {
  it("prints a table and a summary, exits 0 when everything is 2xx", async () => {
    const { out, error } = await run(["run", scenarioFile(TRIAL_CHURNS), "--to", server.url, "--seed", "1"]);
    expect(error).toBeUndefined();
    expect(out).toMatch(/trial-churns/);
    expect(out).toMatch(/Trial starts, user cancels/);
    expect(out).toMatch(/#\s+event\s+virtual time\s+status\s+latency/);
    expect(out).toMatch(/1\s+INITIAL_PURCHASE\s+2025-01-01T00:00:00\.000Z\s+200\s+\d+ ms/);
    expect(out).toMatch(/2\s+CANCELLATION\s+2025-01-03T00:00:00\.000Z\s+200/);
    expect(out).toMatch(/3\s+EXPIRATION\s+2025-01-08T00:00:00\.000Z\s+200/);
    expect(out).toMatch(/3 events · 3 ok · 0 failed · virtual span 7d \(2025-01-01 → 2025-01-08\)/);
    expect(server.requests).toHaveLength(3);
  });

  it("non-2xx → summary counts failures and exit code 1", async () => {
    server.status = 503;
    const { out, error } = await run(["run", scenarioFile(TRIAL_CHURNS), "--to", server.url]);
    expect(error).toBeInstanceOf(RccError);
    expect(error!.exitCode).toBe(1);
    expect(out).toMatch(/0 ok · 3 failed/);
  });

  it("--dry-run prints envelopes as JSON lines on stdout and the table on stderr", async () => {
    const { out, err, error } = await run(["run", scenarioFile(TRIAL_CHURNS), "--dry-run", "--seed", "1"]);
    expect(error).toBeUndefined();
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect((JSON.parse(lines[2]!) as { event: { type: string } }).event.type).toBe("EXPIRATION");
    expect(err).toMatch(/virtual span 7d/);
    expect(server.requests).toHaveLength(0);
  });

  it("--auth-header is sent", async () => {
    await run(["run", scenarioFile(TRIAL_CHURNS), "--to", server.url, "--auth-header", "Bearer dev"]);
    expect(server.requests[0]!.headers["authorization"]).toBe("Bearer dev");
  });

  it("scenario errors point to file:line", async () => {
    const file = scenarioFile("name: bad\nsteps:\n  - event: INITIAL_PURCHASE\n  - event: UNCANCELLATION\n");
    const { error } = await run(["run", file, "--dry-run"]);
    expect(error!.message).toMatch(/step 2/);
    expect(error!.message).toContain(`${file}:4`);
    const missing = await run(["run", "/nope/none.yaml"]);
    expect(missing.error!.message).toMatch(/none\.yaml/);
  });

  it("invalid --speed is rejected", async () => {
    const { error } = await run(["run", scenarioFile(TRIAL_CHURNS), "--dry-run", "--speed", "fast"]);
    expect(error!.message).toMatch(/--speed/);
    expect(error!.message).toMatch(/instant/);
  });
});
