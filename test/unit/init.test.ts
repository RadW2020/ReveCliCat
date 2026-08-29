import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram } from "../../src/program.js";
import { RccError } from "../../src/core/errors.js";
import { Collector, startTestServer, type TestServer } from "../helpers/server.js";

let dir: string;
const originalCwd = process.cwd();
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rcc-init-"));
  process.chdir(dir);
});
afterEach(() => process.chdir(originalCwd));

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

describe("T-051 rcc init", () => {
  it("creates the config file and the six example scenarios, and suggests the next command", async () => {
    const { out, error } = await cli(["init"]);
    expect(error).toBeUndefined();
    const cfg = JSON.parse(readFileSync(join(dir, "reveclicat.config.json"), "utf8")) as Record<string, unknown>;
    expect(cfg).toEqual({ to: "http://localhost:3000/webhook", store: "app_store", environment: "SANDBOX" });
    expect(readdirSync(join(dir, "scenarios")).sort()).toEqual([
      "billing-issue-churns.yaml",
      "billing-issue-recovers.yaml",
      "cancel-then-uncancel.yaml",
      "happy-year.yaml",
      "play-trial-converts.yaml",
      "trial-churns.yaml",
      "trial-converts.yaml",
    ]);
    expect(out).toMatch(/reveclicat\.config\.json/);
    expect(out).toMatch(/Created 8 files/);
    expect(out).toMatch(/scenarios\/trial-churns\.yaml/);
    expect(out).toMatch(/rcc run scenarios\/trial-churns\.yaml/);
  });

  it("refuses to overwrite existing files unless --force", async () => {
    writeFileSync(join(dir, "reveclicat.config.json"), '{"to":"http://keep/me"}');
    const { error } = await cli(["init"]);
    expect(error).toBeInstanceOf(RccError);
    expect(error!.message).toMatch(/reveclicat\.config\.json/);
    expect(error!.hint).toMatch(/--force/);
    expect(readFileSync(join(dir, "reveclicat.config.json"), "utf8")).toBe('{"to":"http://keep/me"}');
    expect(existsSync(join(dir, "scenarios"))).toBe(false);

    const forced = await cli(["init", "--force"]);
    expect(forced.error).toBeUndefined();
    expect(readFileSync(join(dir, "reveclicat.config.json"), "utf8")).toMatch(/localhost:3000/);
    expect(existsSync(join(dir, "scenarios/happy-year.yaml"))).toBe(true);
  });
});

describe("T-051 config defaults feed send and run", () => {
  let server: TestServer;
  beforeEach(async () => {
    server = await startTestServer();
    writeFileSync(join(dir, "reveclicat.config.json"), JSON.stringify({ to: server.url, authHeader: "Bearer cfg", environment: "PRODUCTION" }));
  });
  afterEach(() => server.close());

  it("send uses config for --to, --auth-header and --environment; flags win", async () => {
    const { error } = await cli(["send", "TEST"]);
    expect(error).toBeUndefined();
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.headers["authorization"]).toBe("Bearer cfg");
    expect((server.requests[0]!.body as { event: { environment: string } }).event.environment).toBe("PRODUCTION");
    await cli(["send", "TEST", "--environment", "SANDBOX", "--auth-header", "Bearer flag"]);
    expect(server.requests[1]!.headers["authorization"]).toBe("Bearer flag");
    expect((server.requests[1]!.body as { event: { environment: string } }).event.environment).toBe("SANDBOX");
  });

  it("run uses config for --to and --auth-header", async () => {
    writeFileSync(join(dir, "s.yaml"), "name: s\nsteps:\n  - event: TEST\n");
    const { error } = await cli(["run", "s.yaml"]);
    expect(error).toBeUndefined();
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.headers["authorization"]).toBe("Bearer cfg");
  });

  it("a broken config file is reported with its path", async () => {
    writeFileSync(join(dir, "reveclicat.config.json"), "{broken");
    const { error } = await cli(["send", "TEST"]);
    expect(error!.message).toMatch(/reveclicat\.config\.json/);
  });
});
