/** Minimal ANSI colour helpers (no dependency). Disabled when NO_COLOR is set or stdout is not a TTY. */
const ESC = String.fromCharCode(27);
const enabled = (): boolean =>
  process.env["NO_COLOR"] === undefined && process.env["FORCE_COLOR"] !== "0" && (process.stdout.isTTY || process.env["FORCE_COLOR"] !== undefined);

const wrap = (open: number, close = 39) => (s: string): string =>
  enabled() ? `${ESC}[${open}m${s}${ESC}[${close}m` : s;

export const red = wrap(31);
export const green = wrap(32);
export const yellow = wrap(33);
export const cyan = wrap(36);
export const magenta = wrap(35);
export const dim = wrap(2, 22);
export const bold = wrap(1, 22);
