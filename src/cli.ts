#!/usr/bin/env node
import { CommanderError } from "commander";
import { buildProgram } from "./program.js";
import { formatError, exitCodeFor } from "./core/errors.js";

buildProgram()
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    if (err instanceof CommanderError) {
      // --help / --version exit 0; usage errors were already printed by the formatter.
      process.exitCode = err.exitCode;
      return;
    }
    process.stderr.write(formatError(err) + "\n");
    process.exitCode = exitCodeFor(err);
  });
