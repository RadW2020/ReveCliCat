import type { Command } from "commander";
import { RccError } from "../core/errors.js";

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("(coming soon)")
    .action(() => {
      throw new RccError("'rcc run' is not implemented yet.");
    });
}
