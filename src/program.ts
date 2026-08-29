import { Command, type CommanderError } from "commander";
import pkg from "../package.json" with { type: "json" };
import { registerSend } from "./commands/send.js";
import { registerListen } from "./commands/listen.js";
import { registerRun } from "./commands/run.js";
import { registerInit } from "./commands/init.js";
import { RccError, formatError } from "./core/errors.js";
import { defaultIo, type Io } from "./core/io.js";

/** Exit code for command-line usage errors (unknown command/option, missing argument). */
export const USAGE_EXIT_CODE = 2;

export function buildProgram(io: Io = defaultIo): Command {
  const program = new Command();
  program
    .name("rcc")
    .description(
      "Simulate RevenueCat subscription lifecycles and test webhooks locally and in CI.\n" +
        "Unofficial project — not affiliated with RevenueCat, Inc.",
    )
    .version(pkg.version, "-v, --version", "print the version")
    .exitOverride((err: CommanderError) => {
      if (err.exitCode !== 0) err.exitCode = USAGE_EXIT_CODE;
      throw err;
    });

  registerSend(program, io);
  registerListen(program, io);
  registerRun(program, io);
  registerInit(program, io);

  // Route commander's own usage errors through the same formatter as every other error.
  for (const cmd of [program, ...program.commands]) {
    const label = cmd === program ? "rcc" : `rcc ${cmd.name()}`;
    cmd.configureOutput({
      writeOut: (s) => io.stdout.write(s),
      writeErr: (s) => io.stderr.write(s),
      outputError: (str, write) => {
        const message = str.trim().replace(/^error:\s*/i, "");
        write(formatError(new RccError(message, { hint: `Run \`${label} --help\` for usage.`, exitCode: USAGE_EXIT_CODE })) + "\n");
      },
    });
  }
  return program;
}
