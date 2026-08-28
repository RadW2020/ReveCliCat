import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScenarioValidationError, loadScenario, parseScenario } from "../../src/core/scenario.js";
import type { RccError } from "../../src/core/errors.js";

const FIX = join(import.meta.dirname, "../fixtures/scenarios");

function scenarioFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rcc-scn-"));
  const file = join(dir, "s.yaml");
  writeFileSync(file, content);
  return file;
}

function expectError(content: string): ScenarioValidationError {
  try {
    parseScenario(content, "s.yaml");
  } catch (err) {
    expect(err).toBeInstanceOf(ScenarioValidationError);
    return err as ScenarioValidationError;
  }
  throw new Error("expected a ScenarioValidationError");
}

describe("T-030 loadScenario — valid input", () => {
  it("parses a fully specified scenario", () => {
    const s = loadScenario(join(FIX, "valid.yaml"));
    expect(s.name).toBe("valid-scenario");
    expect(s.subscriber).toEqual({
      app_user_id: "auto",
      product_id: "com.example.premium.monthly",
      period: "P1M",
      trial: "P1W",
      grace_period: "P16D",
      store: "app_store",
      environment: "SANDBOX",
    });
    expect(s.steps).toHaveLength(3);
    expect(s.steps[0]).toEqual({
      event: "INITIAL_PURCHASE",
      set: { price: 9.99, "subscriber_attributes.plan.value": "pro" },
    });
    expect(s.steps[1]).toEqual({ advance: "P1W" });
    expect(s.steps[2]).toEqual({ event: "RENEWAL", expect: { response_status: 200 } });
    expect(s.expect).toEqual({ all_responses_status: 200, max_response_ms: 500 });
  });

  it("applies defaults to a minimal scenario", () => {
    const s = loadScenario(join(FIX, "minimal.yaml"));
    expect(s.description).toBeUndefined();
    expect(s.subscriber).toEqual({
      app_user_id: "auto",
      product_id: "com.example.premium.monthly",
      period: "P1M",
      grace_period: "P16D",
      store: "app_store",
      environment: "SANDBOX",
    });
    expect(s.subscriber.trial).toBeUndefined();
    expect(s.expect).toBeUndefined();
  });

  it("reports a missing file with a hint", () => {
    expect(() => loadScenario("/nope/missing.yaml")).toThrow(/missing\.yaml/);
    try {
      loadScenario("/nope/missing.yaml");
    } catch (err) {
      expect((err as RccError).hint).toMatch(/rcc init/);
    }
  });
});

describe("T-030 loadScenario — errors with line/column", () => {
  it("rejects unknown top-level keys", () => {
    const e = expectError("name: x\nsteps:\n  - event: TEST\nfoo: 1\n");
    expect(e.line).toBe(4);
    expect(e.column).toBe(1);
    expect(e.message).toMatch(/foo/);
    expect(e.message).toMatch(/s\.yaml:4:1/);
  });

  it("rejects unknown event types and lists the valid ones", () => {
    const e = expectError("name: x\nsteps:\n  - event: REFUND\n");
    expect(e.line).toBe(3);
    expect(e.column).toBe(12);
    expect(e.path).toBe("steps[0].event");
    expect(e.message).toMatch(/INITIAL_PURCHASE/);
    expect(e.message).toMatch(/EXPIRATION/);
  });

  it("rejects invalid durations reporting the value", () => {
    const e = expectError("name: x\nsteps:\n  - event: TEST\n  - advance: 1 week\n");
    expect(e.line).toBe(4);
    expect(e.path).toBe("steps[1].advance");
    expect(e.message).toMatch(/1 week/);
  });

  it("rejects a step with both event and advance", () => {
    const e = expectError("name: x\nsteps:\n  - event: TEST\n    advance: P1D\n");
    expect(e.path).toMatch(/^steps\[0\]/);
    expect(e.message).toMatch(/exactly one of/i);
  });

  it("rejects a step that is neither", () => {
    const e = expectError("name: x\nsteps:\n  - set:\n      a: 1\n");
    expect(e.path).toMatch(/^steps\[0\]/);
  });

  it("rejects empty steps and missing name", () => {
    expect(expectError("name: x\nsteps: []\n").path).toBe("steps");
    const e = expectError("steps:\n  - event: TEST\n");
    expect(e.path).toBe("name");
  });

  it("rejects bad subscriber values (store, environment, period)", () => {
    expect(expectError("name: x\nsubscriber:\n  store: play_store\nsteps:\n  - event: TEST\n").path).toBe("subscriber.store");
    expect(expectError("name: x\nsubscriber:\n  environment: prod\nsteps:\n  - event: TEST\n").message).toMatch(/SANDBOX/);
    expect(expectError("name: x\nsubscriber:\n  period: monthly\nsteps:\n  - event: TEST\n").message).toMatch(/monthly/);
  });

  it("rejects bad expectations", () => {
    expect(expectError("name: x\nsteps:\n  - event: TEST\n    expect:\n      response_status: ok\n").path).toBe("steps[0].expect.response_status");
    expect(expectError("name: x\nsteps:\n  - event: TEST\nexpect:\n  max_response_ms: -1\n").path).toBe("expect.max_response_ms");
  });

  it("reports YAML syntax errors with position", () => {
    const e = expectError("name: x\nsteps:\n  - event: TEST\n   bad: [\n");
    expect(e.line).toBeGreaterThan(0);
    expect(e.message).toMatch(/s\.yaml:\d+:\d+/);
  });

  it("includes the file path when loading from disk", () => {
    const file = scenarioFile("name: x\nsteps:\n  - event: NOPE\n");
    try {
      loadScenario(file);
    } catch (err) {
      expect((err as ScenarioValidationError).file).toBe(file);
      expect((err as Error).message).toContain(`${file}:3:12`);
      return;
    }
    throw new Error("expected failure");
  });
});
