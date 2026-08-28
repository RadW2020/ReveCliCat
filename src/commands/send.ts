import type { Command } from "commander";
import { RccError } from "../core/errors.js";

export function registerSend(program: Command): void {
  program
    .command("send")
    .description("(coming soon)")
    .action(() => {
      throw new RccError("'rcc send' is not implemented yet.");
    });
}
