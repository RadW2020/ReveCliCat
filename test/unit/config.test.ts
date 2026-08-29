import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE, loadConfig, resolveDefaults } from "../../src/core/config.js";
import { RccError } from "../../src/core/errors.js";

function dirWith(content?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rcc-cfg-"));
  if (content !== undefined) writeFileSync(join(dir, CONFIG_FILE), content);
  return dir;
}

describe("T-051 loadConfig", () => {
  it("returns {} when there is no config file", () => {
    expect(loadConfig(dirWith())).toEqual({});
  });
  it("parses a valid config", () => {
    const cfg = loadConfig(dirWith('{"to":"http://x:1/w","authHeader":"Bearer a","store":"app_store","environment":"PRODUCTION"}'));
    expect(cfg).toEqual({ to: "http://x:1/w", authHeader: "Bearer a", store: "app_store", environment: "PRODUCTION" });
  });
  it("rejects malformed JSON and unknown keys naming the file", () => {
    const bad = dirWith("{nope");
    expect(() => loadConfig(bad)).toThrow(RccError);
    expect(() => loadConfig(bad)).toThrow(CONFIG_FILE);
    const unknown = dirWith('{"target":"http://x"}');
    expect(() => loadConfig(unknown)).toThrow(/target/);
    expect(() => loadConfig(dirWith('{"environment":"prod"}'))).toThrow(/SANDBOX/);
  });
});

describe("T-051 resolveDefaults", () => {
  it("flag > config > built-in default", () => {
    const cfg = { to: "http://cfg/w", authHeader: "Bearer cfg", environment: "PRODUCTION" as const };
    expect(resolveDefaults({ to: "http://flag/w" }, cfg)).toMatchObject({ to: "http://flag/w", authHeader: "Bearer cfg", environment: "PRODUCTION", store: "app_store" });
    expect(resolveDefaults({}, {})).toEqual({ to: "http://localhost:3000/webhook", authHeader: undefined, store: "app_store", environment: "SANDBOX" });
  });
});
