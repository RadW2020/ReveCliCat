#!/usr/bin/env node
import { buildProgram } from "./program.js";
import { formatError, exitCodeFor } from "./core/errors.js";

buildProgram()
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    process.stderr.write(formatError(err) + "\n");
    process.exitCode = exitCodeFor(err);
  });
