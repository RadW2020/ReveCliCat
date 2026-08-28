import type { Command } from "commander";
import { RccError } from "../core/errors.js";

export function registerListen(program: Command): void {
  program
    .command("listen")
    .description("(coming soon)")
    .action(() => {
      throw new RccError("'rcc listen' is not implemented yet.");
    });
}
