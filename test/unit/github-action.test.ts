import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const file = join(import.meta.dirname, "../../examples/github-action.yml");

interface Workflow {
  name: string;
  on: unknown;
  jobs: Record<string, { "runs-on": string; steps: Array<{ name?: string; uses?: string; run?: string; with?: Record<string, unknown> }> }>;
}

describe("T-042 examples/github-action.yml", () => {
  const wf = parse(readFileSync(file, "utf8")) as Workflow;
  const steps = Object.values(wf.jobs).flatMap((j) => j.steps);
  const runs = steps.map((s) => s.run ?? "").join("\n");

  it("is a valid workflow with one job on ubuntu", () => {
    expect(wf.name).toBeTruthy();
    expect(wf.on).toBeDefined();
    expect(Object.keys(wf.jobs)).toHaveLength(1);
    expect(Object.values(wf.jobs)[0]!["runs-on"]).toMatch(/ubuntu/);
  });

  it("checks out, sets up Node 20 and installs with npm ci", () => {
    expect(steps.some((s) => s.uses?.startsWith("actions/checkout@"))).toBe(true);
    const setup = steps.find((s) => s.uses?.startsWith("actions/setup-node@"));
    expect(setup?.with?.["node-version"]).toBe(20);
    expect(runs).toMatch(/npm ci/);
  });

  it("starts the reference handler, waits for /health, then runs two scenarios with --json", () => {
    expect(runs).toMatch(/examples\/express-handler\.ts/);
    expect(runs).toMatch(/\/health/);
    expect(runs).toMatch(/(rcc|dist\/cli\.js) run scenarios\/trial-churns\.yaml[^\n]*--json/);
    expect(runs).toMatch(/(rcc|dist\/cli\.js) run scenarios\/billing-issue-recovers\.yaml[^\n]*--json/);
    expect(runs).toMatch(/--auth-header/);
  });
});
