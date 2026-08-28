import type { Command } from "commander";
import { RccError } from "../core/errors.js";
import type { Io } from "../core/io.js";

export function registerListen(program: Command, _io: Io): void {
  program
    .command("listen")
    .description("(coming soon)")
    .action(() => {
      throw new RccError("'rcc listen' is not implemented yet.");
    });
}
