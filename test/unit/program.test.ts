import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/program.js";

describe("T-001 program", () => {
  it("builds a commander program named rcc with the package version", () => {
    const program = buildProgram();
    expect(program.name()).toBe("rcc");
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exposes the top-level commands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(["send", "listen", "run", "init"]));
  });
});
