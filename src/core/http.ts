import { RccError } from "./errors.js";
import type { WebhookEnvelope } from "../schemas/index.js";

export interface PostResult {
  status: number;
  latencyMs: number;
  body: string;
}

export interface PostOptions {
  authHeader?: string | undefined;
  /** Abort after this many ms (default 30 000). */
  timeoutMs?: number | undefined;
}

export function unreachableError(url: string, cause: unknown): RccError {
  return new RccError(`Could not reach ${url}. Is your server running? Try \`rcc listen\` to test locally.`, {
    hint: `Then send events with: rcc send INITIAL_PURCHASE --to http://localhost:8787/webhook`,
    cause,
  });
}

/** POST an envelope as JSON. Network failures become an actionable RccError; HTTP status is returned as-is. */
export async function postEvent(url: string, envelope: WebhookEnvelope, opts: PostOptions = {}): Promise<PostResult> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "reveclicat" };
  if (opts.authHeader !== undefined) headers["authorization"] = opts.authHeader;
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (cause) {
    throw unreachableError(url, cause);
  }
  const body = await res.text().catch(() => "");
  return { status: res.status, latencyMs: Math.round(performance.now() - started), body };
}

export function assertUrl(value: string, flag: string): string {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol");
    return value;
  } catch {
    throw new RccError(`Invalid URL for ${flag}: "${value}".`, { hint: "Use an absolute http(s) URL, e.g. http://localhost:3000/webhook." });
  }
}
