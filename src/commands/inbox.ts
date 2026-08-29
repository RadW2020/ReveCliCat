import type { Command } from "commander";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { RccError } from "../core/errors.js";
import { println, type Io } from "../core/io.js";
import { bold, cyan, dim, green, red, yellow } from "../core/colors.js";
import { classifyEnvelope } from "../schemas/index.js";

export const DEFAULT_INBOX_PORT = 8788;
const EVENTS_FILE = "events.jsonl";
const KEPT_HEADERS = ["authorization", "content-type", "user-agent", "x-revenuecat-webhook-signature"];

/** One stored delivery. `body` is the raw request text so nothing is lost. */
export interface InboxRecord {
  seq: number;
  receivedAt: string;
  headers: Record<string, string>;
  body: string;
  valid: boolean;
  authOk: boolean;
  issues?: Array<{ path: string; message: string }>;
  eventId?: string;
  eventType?: string;
  /** Well-formed event whose `type` is not one of the 7 rcc generates (forward compatibility). */
  unsupportedType?: boolean;
  duplicateOf?: number;
}

export interface InboxOptions {
  port: number;
  token: string;
  authHeader?: string | undefined;
  dataDir: string;
  maxEvents?: number | undefined;
  io: Io;
}

export interface Inbox {
  url: string;
  port: number;
  subscribers: number;
  close(): Promise<void>;
}

/* ------------------------------------------------------------------ storage */

class Store {
  private records: InboxRecord[] = [];
  private lastSeq = 0;
  private readonly file: string;

  constructor(
    private readonly dir: string,
    private readonly maxEvents: number,
  ) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, EVENTS_FILE);
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          this.records.push(JSON.parse(line) as InboxRecord);
        } catch {
          /* skip corrupt line */
        }
      }
      this.lastSeq = this.records.at(-1)?.seq ?? 0;
      if (this.records.length > this.maxEvents) this.compact();
    }
  }

  nextSeq(): number {
    return ++this.lastSeq;
  }

  add(rec: InboxRecord): void {
    this.records.push(rec);
    appendFileSync(this.file, JSON.stringify(rec) + "\n");
    if (this.records.length > this.maxEvents) this.compact();
  }

  private compact(): void {
    this.records = this.records.slice(-this.maxEvents);
    writeFileSync(this.file, this.records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }

  since(seq: number, limit: number): InboxRecord[] {
    return this.records.filter((r) => r.seq > seq).slice(0, limit);
  }

  findByEventId(id: string): InboxRecord | undefined {
    return this.records.find((r) => r.eventId === id);
  }

  get count(): number {
    return this.records.length;
  }
}

/* ------------------------------------------------------------------ server */

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const clock = (): string => new Date().toISOString().slice(11, 19);

/** Start the self-hosted inbox. Resolves once listening. */
export async function startInbox(opts: InboxOptions): Promise<Inbox> {
  if (!opts.token) {
    throw new RccError("rcc inbox needs a read token.", {
      hint: "Pass --token <secret> (or set INBOX_TOKEN). Clients read events with `rcc tail --inbox <url> --token <secret>`.",
    });
  }
  const { io } = opts;
  const log = (s: string): void => println(io.stdout, s);
  const store = new Store(opts.dataDir, opts.maxEvents ?? 10_000);
  const streams = new Set<ServerResponse>();

  const authorized = (req: IncomingMessage, url: URL): boolean =>
    req.headers["authorization"] === `Bearer ${opts.token}` || url.searchParams.get("token") === opts.token;

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://inbox");
    const path = url.pathname;

    if (req.method === "GET" && path === "/health") {
      json(res, 200, { ok: true, events: store.count });
      return;
    }
    if (req.method === "POST" && path === "/webhook") {
      await receive(req, res);
      return;
    }
    if (req.method === "GET" && (path === "/events" || path === "/events/stream")) {
      if (!authorized(req, url)) {
        json(res, 401, { error: "Missing or invalid token. Use `Authorization: Bearer <token>` or ?token=." });
        return;
      }
      const since = Number(url.searchParams.get("since") ?? (path === "/events" ? "0" : String(store.count === 0 ? 0 : store.since(0, Infinity).at(-1)!.seq)));
      if (path === "/events") {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 1000);
        const events = store.since(since, limit);
        json(res, 200, { events, next: events.at(-1)?.seq ?? since });
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(`event: ready\ndata: {}\n\n`);
      for (const rec of store.since(since, Infinity)) res.write(`id: ${rec.seq}\nevent: webhook\ndata: ${JSON.stringify(rec)}\n\n`);
      streams.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      res.on("close", () => {
        clearInterval(ping);
        streams.delete(res);
      });
      return;
    }
    json(res, 404, { error: `Not found. Endpoints: POST /webhook, GET /events, GET /events/stream, GET /health.` });
  }

  async function receive(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await readBody(req);
    const headers: Record<string, string> = {};
    for (const h of KEPT_HEADERS) {
      const v = req.headers[h];
      if (typeof v === "string") headers[h] = v;
    }
    const authOk = opts.authHeader === undefined || headers["authorization"] === opts.authHeader;

    let parsed: unknown;
    let isJson = true;
    try {
      parsed = JSON.parse(raw);
    } catch {
      isJson = false;
    }
    const rec: InboxRecord = { seq: store.nextSeq(), receivedAt: new Date().toISOString(), headers, body: raw, valid: false, authOk };
    let status: number;
    let label: string;
    if (!isJson) {
      status = 400;
      label = `${red(bold("INVALID"))}  body is not JSON`;
    } else {
      const classified = classifyEnvelope(parsed);
      if (classified.kind !== "invalid") {
        const ev = classified.envelope.event;
        rec.valid = true;
        rec.eventId = ev.id;
        rec.eventType = ev.type;
        if (classified.kind === "unknown-type") rec.unsupportedType = true;
        const dup = store.findByEventId(rec.eventId);
        if (dup) rec.duplicateOf = dup.seq;
        const typeLabel = classified.kind === "known" ? cyan(bold(ev.type.padEnd(16))) : `${yellow(bold("UNSUPPORTED"))} ${yellow(ev.type)}`;
        label = `${typeLabel} ${yellow(ev.app_user_id)}${dup ? dim(`  (retry of #${dup.seq})`) : ""}`;
      } else {
        rec.issues = classified.issues;
        label = `${red(bold("INVALID"))}  ${rec.issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join("; ")}`;
      }
      status = authOk ? 200 : 401;
    }
    if (!authOk) label = `${red(bold("AUTH MISMATCH"))}  ${label}`;

    store.add(rec);
    for (const s of streams) s.write(`id: ${rec.seq}\nevent: webhook\ndata: ${JSON.stringify(rec)}\n\n`);
    log(`${dim(clock())}  #${rec.seq}  ${label}  → ${status < 300 ? green(String(status)) : red(String(status))}`);
    json(res, status, status === 400 ? { error: "Body is not valid JSON" } : status === 401 ? { error: "Authorization header mismatch" } : { ok: true, seq: rec.seq });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "EADDRINUSE"
          ? new RccError(`Port ${opts.port} is already in use.`, { hint: `Pick another one: rcc inbox --port ${opts.port + 1}` })
          : new RccError(`Could not start the inbox: ${err.message}`, { cause: err }),
      );
    });
    server.listen(opts.port, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const url = `http://localhost:${port}`;
  log(`${green("●")} Inbox listening on ${bold(url)} — ${store.count} stored event${store.count === 1 ? "" : "s"} in ${opts.dataDir}`);
  log(dim(`  RevenueCat → POST ${url}/webhook${opts.authHeader === undefined ? "  (no --auth-header: accepting any Authorization)" : ""}`));
  log(dim(`  you       → rcc tail --inbox <public-url> --token <token>`));

  return {
    url,
    port,
    get subscribers() {
      return streams.size;
    },
    close: () =>
      new Promise((resolve, reject) => {
        for (const s of streams) s.destroy();
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function registerInbox(program: Command, io: Io): void {
  program
    .command("inbox")
    .description("Run a self-hosted webhook inbox: stores every delivery (JSONL) and streams it to `rcc tail --inbox`. Put HTTPS in front.")
    .option("--port <n>", "port to listen on (env PORT)", process.env["PORT"] ?? String(DEFAULT_INBOX_PORT))
    .option("--token <secret>", "bearer token clients need to read events (env INBOX_TOKEN)", process.env["INBOX_TOKEN"])
    .option("--auth-header <value>", "Authorization value RevenueCat must send; mismatches stored and answered 401 (env RC_WEBHOOK_AUTH)", process.env["RC_WEBHOOK_AUTH"])
    .option("--data-dir <dir>", "where events.jsonl lives (env INBOX_DATA_DIR)", process.env["INBOX_DATA_DIR"] ?? "./inbox-data")
    .option("--max-events <n>", "keep only the newest N events", "10000")
    .addHelpText("after", `
Examples:
  $ rcc inbox --token s3cret --auth-header "Bearer from-dashboard"
  $ INBOX_TOKEN=s3cret PORT=8080 rcc inbox --data-dir /data`)
    .action(async (opts: { port: string; token?: string; authHeader?: string; dataDir: string; maxEvents: string }) => {
      if (!/^\d{1,5}$/.test(opts.port) || Number(opts.port) > 65535) {
        throw new RccError(`Invalid --port "${opts.port}".`, { hint: "Use an integer between 1 and 65535." });
      }
      const maxEvents = Number(opts.maxEvents);
      if (!Number.isInteger(maxEvents) || maxEvents < 1) throw new RccError(`Invalid --max-events "${opts.maxEvents}".`);
      const box = await startInbox({ port: Number(opts.port), token: opts.token ?? "", authHeader: opts.authHeader, dataDir: opts.dataDir, maxEvents, io });
      const stop = (): void => {
        void box.close().finally(() => process.exit(0));
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      await new Promise<void>(() => {
        /* run until killed */
      });
    });
}
