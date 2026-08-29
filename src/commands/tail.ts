import type { Command } from "commander";
import { RccError } from "../core/errors.js";
import { assertUrl } from "../core/http.js";
import { println, type Io } from "../core/io.js";
import { bold, cyan, dim, green, magenta, red, yellow } from "../core/colors.js";
import { WebhookEnvelopeSchema } from "../schemas/index.js";

export const SMEE_ORIGIN = "https://smee.io";

/* ------------------------------------------------------------------ SSE */

export interface SseFrame {
  id?: string;
  event?: string;
  data: string;
}

/** Parse a text/event-stream byte stream into frames. Comments (`: ping`) and empty frames are dropped. */
export async function* parseSseStream(source: AsyncIterable<Uint8Array>): AsyncGenerator<SseFrame> {
  const decoder = new TextDecoder();
  let buffer = "";
  let cur: { id?: string; event?: string; data: string[] } = { data: [] };
  const flush = (): SseFrame | undefined => {
    if (cur.data.length === 0) {
      cur = { data: [] };
      return undefined;
    }
    const frame: SseFrame = { data: cur.data.join("\n") };
    if (cur.id !== undefined) frame.id = cur.id;
    if (cur.event !== undefined) frame.event = cur.event;
    cur = { data: [] };
    return frame;
  };
  for await (const chunk of source) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line === "") {
        const f = flush();
        if (f) yield f;
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "data") cur.data.push(value);
      else if (field === "id") cur.id = value;
      else if (field === "event") cur.event = value;
    }
  }
  const last = flush();
  if (last) yield last;
}

/* ------------------------------------------------------------------ smee */

/** GET <origin>/new and return the channel URL from the redirect. */
export async function createSmeeChannel(origin = SMEE_ORIGIN): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${origin}/new`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  } catch (cause) {
    throw new RccError(`Could not reach ${origin} to create a channel.`, {
      hint: "Check your connection, or pass an existing channel: rcc tail --smee https://smee.io/<channel>",
      cause,
    });
  }
  const location = res.headers.get("location");
  if (!location) throw new RccError(`${origin}/new did not return a channel URL (HTTP ${res.status}).`);
  return new URL(location, origin).toString();
}

/* ------------------------------------------------------------------ tail */

export type TailSource =
  | { kind: "smee"; url: string }
  | { kind: "inbox"; url: string; token: string; since?: number | undefined };

export interface TailOptions {
  source: TailSource;
  forward?: string | undefined;
  verbose?: boolean | undefined;
  io: Io;
  /** Reconnect delays in ms (last one repeats). */
  backoffMs?: number[] | undefined;
}

export interface TailHandle {
  close(): Promise<void>;
  /** Resolves when the loop exits (after close()). */
  done: Promise<void>;
}

interface RelayedRequest {
  headers: Record<string, string>;
  /** Parsed body (smee) — used for validation and printing. */
  body: unknown;
  /** Raw body when the source preserves it (inbox); forwarded verbatim. */
  raw?: string | undefined;
  timestamp: number | undefined;
}

/** `rcc inbox` records: `{ seq, receivedAt, headers, body: <raw string>, ... }`. */
function fromInbox(data: string): RelayedRequest | undefined {
  let rec: { headers?: Record<string, string>; body?: string; receivedAt?: string };
  try {
    rec = JSON.parse(data) as typeof rec;
  } catch {
    return undefined;
  }
  if (typeof rec.body !== "string") return undefined;
  let body: unknown = rec.body;
  try {
    body = JSON.parse(rec.body);
  } catch {
    /* keep raw */
  }
  return { headers: rec.headers ?? {}, body, raw: rec.body, timestamp: rec.receivedAt ? Date.parse(rec.receivedAt) : undefined };
}

/** smee delivers `{ ...lower-cased request headers, body, query, timestamp }`. */
function fromSmee(data: string): RelayedRequest | undefined {
  let obj: unknown;
  try {
    obj = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (typeof obj !== "object" || obj === null) return undefined;
  const { body, query: _q, timestamp, ...rest } = obj as Record<string, unknown>;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rest)) if (typeof v === "string") headers[k.toLowerCase()] = v;
  return { headers, body, timestamp: typeof timestamp === "number" ? timestamp : undefined };
}

const clock = (ms?: number): string => new Date(ms ?? Date.now()).toISOString().slice(11, 19);
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Follow a relay's SSE stream, print each real webhook, optionally forward it to a local URL. */
export function startTail(opts: TailOptions): TailHandle {
  const { io } = opts;
  const log = (s: string): void => println(io.stdout, s);
  const controller = new AbortController();
  const backoff = opts.backoffMs ?? [1000, 2000, 5000, 10_000, 30_000];

  const src = opts.source;
  const streamUrl = (): string => {
    if (src.kind === "smee") return src.url;
    const u = new URL("/events/stream", src.url.endsWith("/") ? src.url : src.url + "/");
    if (src.since !== undefined) u.searchParams.set("since", String(src.since));
    return u.toString();
  };
  const streamHeaders = (): Record<string, string> =>
    src.kind === "inbox" ? { accept: "text/event-stream", authorization: `Bearer ${src.token}` } : { accept: "text/event-stream" };

  log(`${green("●")} Tailing ${bold(opts.source.url)}`);
  if (opts.source.kind === "smee") {
    log(`  Paste this URL in RevenueCat → Integrations → Webhooks: ${cyan(opts.source.url)}`);
    log(dim("  smee.io is a public relay with no persistence: events only arrive while this command is running."));
  }
  if (opts.forward) log(dim(`  forwarding each event to ${opts.forward}`));

  async function handle(req: RelayedRequest): Promise<void> {
    const time = dim(clock(req.timestamp));
    const result = WebhookEnvelopeSchema.safeParse(req.body);
    let label: string;
    if (result.success) {
      const ev = result.data.event;
      label = `${cyan(bold(ev.type.padEnd(16)))} ${yellow(ev.app_user_id)}  ${ev.product_id ?? ""}`;
    } else {
      const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      label = `${red(bold("INVALID"))}  ${issues}`;
    }
    let suffix = "";
    if (opts.forward) {
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        const auth = req.headers["authorization"];
        if (auth !== undefined) headers["authorization"] = auth;
        const started = performance.now();
        const res = await fetch(opts.forward, {
          method: "POST",
          headers,
          body: req.raw ?? JSON.stringify(req.body),
          signal: AbortSignal.timeout(30_000),
        });
        const status = res.status < 300 ? green(String(res.status)) : red(String(res.status));
        suffix = `  → ${status} ${dim(`(${Math.round(performance.now() - started)} ms)`)}`;
      } catch (err) {
        suffix = `  ${red("forward failed")}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    log(`${time}  ${magenta("real")}  ${label}${suffix}`);
    if (opts.verbose) log(dim(JSON.stringify(req.body, null, 2)));
  }

  async function loop(): Promise<void> {
    let attempt = 0;
    while (!controller.signal.aborted) {
      try {
        const res = await fetch(streamUrl(), { headers: streamHeaders(), signal: controller.signal });
        if (res.status === 401) {
          throw new RccError(`The inbox at ${src.url} rejected the token (401).`, { hint: "Check --token against the inbox's --token / INBOX_TOKEN." });
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        attempt = 0;
        for await (const frame of parseSseStream(res.body)) {
          if (frame.event === "ready" || frame.data === "{}") continue;
          const req = src.kind === "inbox" ? fromInbox(frame.data) : fromSmee(frame.data);
          if (req) await handle(req);
        }
        if (controller.signal.aborted) return;
        throw new Error("stream ended");
      } catch (err) {
        if (controller.signal.aborted) return;
        const delay = backoff[Math.min(attempt, backoff.length - 1)]!;
        attempt++;
        const reason = err instanceof RccError ? `${err.message} ${err.hint ?? ""}` : err instanceof Error ? err.message : String(err);
        log(`${dim(clock())}  ${yellow("reconnecting")} in ${delay} ms ${dim(`(${reason.trim()})`)}`);
        await sleep(delay, controller.signal);
      }
    }
  }

  const done = loop();
  return {
    done,
    close: async () => {
      controller.abort();
      await done.catch(() => undefined);
    },
  };
}

/* ------------------------------------------------------------------ command */

export function registerTail(program: Command, io: Io): void {
  program
    .command("tail")
    .description("Receive real RevenueCat webhooks on your machine through a relay, print them, and optionally forward them to a local URL.")
    .option("--smee [channel-url]", "use the public smee.io relay; creates a channel when no URL is given")
    .option("--inbox <url>", "use a self-hosted `rcc inbox` at this URL (requires --token)")
    .option("--token <secret>", "read token of the inbox")
    .option("--since <seq>", "inbox only: replay stored events after this sequence number (0 = everything)")
    .option("--all", "inbox only: replay the whole history (same as --since 0)")
    .option("--forward <url>", "re-POST each event (body + Authorization) to this local URL")
    .option("--verbose", "print the full JSON payload of each event")
    .addHelpText("after", `
Examples:
  $ rcc tail --smee                                   # prints a URL to paste in RevenueCat → Integrations → Webhooks
  $ rcc tail --smee https://smee.io/abc123 --forward http://localhost:3000/webhook
  $ rcc tail --smee --verbose
  $ rcc tail --inbox https://hooks.example.com --token s3cret --all --forward http://localhost:3000/webhook`)
    .action(async (opts: { smee?: string | boolean; inbox?: string; token?: string; since?: string; all?: boolean; forward?: string; verbose?: boolean }) => {
      if (opts.smee !== undefined && opts.inbox !== undefined) {
        throw new RccError("Use either --smee or --inbox, not both.");
      }
      if (opts.smee === undefined && opts.inbox === undefined) {
        throw new RccError("rcc tail needs a source.", {
          hint: "Use --smee to receive events through smee.io (zero setup), or --inbox <url> --token <t> for a self-hosted inbox.",
        });
      }
      if (opts.forward !== undefined) assertUrl(opts.forward, "--forward");
      let source: TailSource;
      if (opts.inbox !== undefined) {
        if (!opts.token) throw new RccError("--inbox requires --token.", { hint: "The token is the inbox's --token / INBOX_TOKEN." });
        const since = opts.all ? 0 : opts.since !== undefined ? Number(opts.since) : undefined;
        if (since !== undefined && (!Number.isInteger(since) || since < 0)) throw new RccError(`Invalid --since "${opts.since ?? ""}".`);
        source = { kind: "inbox", url: assertUrl(opts.inbox, "--inbox"), token: opts.token, since };
      } else {
        const url = typeof opts.smee === "string" ? assertUrl(opts.smee, "--smee") : await createSmeeChannel();
        source = { kind: "smee", url };
      }
      const handle = startTail({ source, forward: opts.forward, verbose: opts.verbose, io });
      const stop = (): void => {
        void handle.close().finally(() => process.exit(0));
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      await handle.done;
    });
}
