import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProgram } from "../../src/program.js";

const readme = readFileSync(join(import.meta.dirname, "../../README.md"), "utf8");

function helpText(): string {
  const program = buildProgram();
  return [program.helpInformation(), ...program.commands.map((c) => c.helpInformation())].join("\n");
}

describe("T-050 README", () => {
  it("opens with the non-affiliation disclaimer", () => {
    const firstLine = readme.split("\n").find((l) => l.trim() !== "")!;
    expect(firstLine).toMatch(/not affiliated with RevenueCat, Inc\./i);
    expect(firstLine).toMatch(/unofficial/i);
  });

  it("contains the required sections and placeholders", () => {
    for (const needle of [
      "Deterministic time travel for subscriptions",
      "## What it is",
      "## Why it exists",
      "## Quickstart",
      "npm i -g reveclicat",
      "rcc init",
      "rcc run scenarios/trial-churns.yaml",
      "## Commands",
      "## Scenario format",
      "## CI",
      "examples/github-action.yml",
      "examples/express-handler.ts",
      "](docs/demo.gif)",
      "## Authorization",
      "## State machine",
      "## License",
      "purr",
    ]) {
      expect(readme, needle).toContain(needle);
    }
  });

  it("every flag mentioned in the README exists in --help, and every --help flag is documented", () => {
    const help = helpText();
    const flagsIn = (text: string): Set<string> => new Set([...text.matchAll(/(?<![\w-])--[a-z][a-z-]*/g)].map((m) => m[0]));
    const helpFlags = flagsIn(help);
    const readmeFlags = flagsIn(readme);
    for (const f of readmeFlags) expect(helpFlags.has(f), `README mentions ${f} which is not in --help`).toBe(true);
    for (const f of helpFlags) {
      if (f === "--help" || f === "--version") continue;
      expect(readmeFlags.has(f), `--help has ${f} which the README does not document`).toBe(true);
    }
  });

  it("documents all four commands and the seven event types", () => {
    for (const c of ["rcc send", "rcc listen", "rcc run", "rcc init"]) expect(readme).toContain(c);
    for (const t of ["TEST", "INITIAL_PURCHASE", "RENEWAL", "CANCELLATION", "UNCANCELLATION", "BILLING_ISSUE", "EXPIRATION"]) {
      expect(readme).toContain(t);
    }
  });
});

describe("T-066 demo GIF", () => {
  it("the GIF referenced by the README exists and is a GIF", () => {
    const gif = readFileSync(join(import.meta.dirname, "../../docs/demo.gif"));
    expect(gif.subarray(0, 6).toString("latin1")).toMatch(/^GIF8[79]a$/);
    expect(gif.length).toBeGreaterThan(50_000);
  });
});
