import type { Command } from "commander";
import { RccError } from "../core/errors.js";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("(coming soon)")
    .action(() => {
      throw new RccError("'rcc init' is not implemented yet.");
    });
}
