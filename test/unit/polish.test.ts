import { afterEach, describe, expect, it } from "vitest";
import { buildProgram } from "../../src/program.js";
import { RccError, formatError } from "../../src/core/errors.js";
import { Collector } from "../helpers/server.js";

process.env["NO_COLOR"] = "1";

function helpOf(args: string[]): string {
  const out = new Collector();
  const program = buildProgram({ stdout: out, stderr: out });
  program.exitOverride();
  try {
    program.parse(["node", "rcc", ...args]);
  } catch {
    /* commander throws on --help with exitOverride */
  }
  return out.text;
}

describe("T-052 --help", () => {
  it.each([[[]], [["send"]], [["listen"]], [["run"]], [["init"]]])("help for %j is stable", (args) => {
    expect(helpOf([...args, "--help"])).toMatchSnapshot();
  });

  it("every subcommand help has a description, all flags, and an example", () => {
    for (const cmd of ["send", "listen", "run", "init"]) {
      const text = helpOf([cmd, "--help"]);
      expect(text, cmd).toMatch(/Examples:\n\s+\$ rcc /);
      expect(text, cmd).not.toMatch(/\(default: false\)/);
      expect(text, cmd).not.toMatch(/coming soon/);
    }
  });

  it("shared flags have identical names and descriptions across send and run", () => {
    const program = buildProgram();
    const byName = (cmd: string): Map<string, string> =>
      new Map(program.commands.find((c) => c.name() === cmd)!.options.map((o) => [o.long ?? o.short ?? "", o.description]));
    const send = byName("send");
    const run = byName("run");
    for (const shared of ["--to", "--auth-header", "--seed", "--dry-run"]) {
      expect(send.has(shared), `send ${shared}`).toBe(true);
      expect(run.has(shared), `run ${shared}`).toBe(true);
    }
    for (const same of ["--to", "--auth-header", "--seed"]) expect(send.get(same)).toBe(run.get(same));
    expect(byName("listen").get("--auth-header")).toBeDefined();
  });
});

describe("T-052 usage errors go through the formatter with exit code 2", () => {
  async function usage(args: string[]): Promise<{ text: string; code: number }> {
    const out = new Collector();
    const program = buildProgram({ stdout: out, stderr: out }); // buildProgram installs its own exitOverride
    try {
      await program.parseAsync(["node", "rcc", ...args]);
    } catch (e) {
      return { text: out.text, code: (e as { exitCode: number }).exitCode };
    }
    return { text: out.text, code: 0 };
  }

  it("unknown command", async () => {
    const { text, code } = await usage(["nope"]);
    expect(code).toBe(2);
    expect(text).toMatch(/✖ .*unknown command 'nope'/);
    expect(text).toMatch(/rcc --help/);
    expect(text).not.toMatch(/^error:/m);
  });

  it("missing argument and unknown option", async () => {
    expect((await usage(["send"])).text).toMatch(/✖ .*missing required argument 'EVENT_TYPE'/);
    const unknown = await usage(["run", "x.yaml", "--bogus"]);
    expect(unknown.code).toBe(2);
    expect(unknown.text).toMatch(/✖ .*unknown option '--bogus'/);
    expect(unknown.text).toMatch(/rcc run --help/);
  });

  it("--port keeps the user's input in the message", async () => {
    const out = new Collector();
    const program = buildProgram({ stdout: out, stderr: out });
    program.exitOverride();
    await expect(program.parseAsync(["node", "rcc", "listen", "--port", "abc"])).rejects.toThrow(/Invalid --port "abc"/);
  });
});

describe("T-052 formatError", () => {
  const saved = process.env["RCC_DEBUG"];
  afterEach(() => {
    if (saved === undefined) delete process.env["RCC_DEBUG"];
    else process.env["RCC_DEBUG"] = saved;
  });

  it("renders ✖ message and → hint, without a stack trace by default", () => {
    delete process.env["RCC_DEBUG"];
    const text = formatError(new RccError("Boom.", { hint: "Try this." }));
    expect(text).toBe("✖ Boom.\n  → Try this.");
    expect(formatError(new Error("plain"))).toMatch(/✖ plain\n\s+→ Set RCC_DEBUG=1/);
    expect(formatError(new Error("plain"))).not.toMatch(/at /);
  });

  it("includes the stack when RCC_DEBUG=1", () => {
    process.env["RCC_DEBUG"] = "1";
    expect(formatError(new RccError("Boom."))).toMatch(/\n\s+at /);
    expect(formatError(new Error("plain"))).toMatch(/\n\s+at /);
  });

  it("non-Error values are stringified", () => {
    delete process.env["RCC_DEBUG"];
    expect(formatError("weird")).toBe("✖ weird");
  });
});
