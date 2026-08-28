import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { registerSend } from "./commands/send.js";
import { registerListen } from "./commands/listen.js";
import { registerRun } from "./commands/run.js";
import { registerInit } from "./commands/init.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("rcc")
    .description(
      "Simulate RevenueCat subscription lifecycles and test webhooks locally and in CI.\n" +
        "Unofficial project — not affiliated with RevenueCat, Inc.",
    )
    .version(pkg.version, "-v, --version", "print the version")
    .showHelpAfterError("(run with --help for usage)")
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });

  registerSend(program);
  registerListen(program);
  registerRun(program);
  registerInit(program);
  return program;
}
