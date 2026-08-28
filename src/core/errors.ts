import { dim, red } from "./colors.js";

/** User-facing error with an actionable hint. Rendered by formatError(). */
export class RccError extends Error {
  readonly hint: string | undefined;
  readonly exitCode: number;
  constructor(message: string, opts: { hint?: string; exitCode?: number; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "RccError";
    this.hint = opts.hint;
    this.exitCode = opts.exitCode ?? 1;
  }
}

export function formatError(err: unknown): string {
  const debug = process.env["RCC_DEBUG"] === "1";
  const mark = red("✖");
  if (err instanceof RccError) {
    let out = `${mark} ${err.message}`;
    if (err.hint) out += `\n  ${dim("→ " + err.hint)}`;
    if (debug && err.stack) out += `\n${dim(err.stack)}`;
    return out;
  }
  if (err instanceof Error) {
    return debug
      ? `${mark} ${err.stack ?? err.message}`
      : `${mark} ${err.message}\n  ${dim("→ Set RCC_DEBUG=1 for a stack trace.")}`;
  }
  return `${mark} ${String(err)}`;
}

export function exitCodeFor(err: unknown): number {
  return err instanceof RccError ? err.exitCode : 1;
}
