import type { Command } from "commander";
import { RccError } from "../core/errors.js";
import type { Io } from "../core/io.js";

export function registerRun(program: Command, _io: Io): void {
  program
    .command("run")
    .description("(coming soon)")
    .action(() => {
      throw new RccError("'rcc run' is not implemented yet.");
    });
}
