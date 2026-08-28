import type { Command } from "commander";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { RccError } from "../core/errors.js";
import { assertUrl } from "../core/http.js";
import { println, type Io } from "../core/io.js";
import { bold, cyan, dim, green, red, yellow } from "../core/colors.js";
import { WebhookEnvelopeSchema } from "../schemas/index.js";

export const DEFAULT_PORT = 8787;

export interface ListenOptions {
  port: number;
  forward?: string | undefined;
  authHeader?: string | undefined;
  verbose?: boolean | undefined;
  io: Io;
}

export interface Listener {
  url: string;
  port: number;
  close(): Promise<void>;
}

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

/** Start the local webhook receiver. Resolves once listening. */
export async function startListener(opts: ListenOptions): Promise<Listener> {
  const { io } = opts;
  const log = (s: string): void => println(io.stdout, s);

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      json(res, 404, { error: `Use POST to deliver webhook events (got ${req.method ?? "?"} ${req.url ?? ""}).` });
      return;
    }
    const raw = await readBody(req);
    const time = dim(clock());

    if (opts.authHeader !== undefined && req.headers["authorization"] !== opts.authHeader) {
      log(`${time}  ${red(bold("AUTH MISMATCH"))}  Authorization header ${req.headers["authorization"] === undefined ? "missing" : "does not match --auth-header"}  → 401`);
      json(res, 401, { error: "Authorization header mismatch" });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log(`${time}  ${red(bold("INVALID"))}  body is not JSON  → 400`);
      json(res, 400, { error: "Body is not valid JSON" });
      return;
    }
    const result = WebhookEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.length ? i.path.join(".") : "(root)", message: i.message }));
      const shown = issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join("; ");
      const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : "";
      log(`${time}  ${red(bold("INVALID"))}  ${shown}${more}  → 400`);
      if (opts.verbose) log(dim(JSON.stringify(parsed, null, 2)));
      json(res, 400, { error: "Invalid RevenueCat webhook envelope", issues });
      return;
    }

    const ev = result.data.event;
    let status = 200;
    let suffix = "";
    if (opts.forward !== undefined) {
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        const auth = req.headers["authorization"];
        if (auth !== undefined) headers["authorization"] = auth;
        const started = performance.now();
        const upstream = await fetch(opts.forward, { method: "POST", headers, body: raw, signal: AbortSignal.timeout(30_000) });
        status = upstream.status;
        suffix = `  ${dim("→ forwarded")} ${opts.forward} ${status < 300 ? green(String(status)) : red(String(status))} ${dim(`(${Math.round(performance.now() - started)} ms)`)}`;
      } catch (err) {
        status = 502;
        suffix = `  ${red("forward failed")}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    const statusText = status < 300 ? green(String(status)) : red(String(status));
    log(`${time}  ${cyan(bold(ev.type.padEnd(16)))} ${yellow(ev.app_user_id)}  ${ev.product_id ?? ""}  → ${statusText}${suffix}`);
    if (opts.verbose) log(dim(JSON.stringify(result.data, null, 2)));
    json(res, status, { ok: status < 300 });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "EADDRINUSE"
          ? new RccError(`Port ${opts.port} is already in use.`, { hint: `Pick another one: rcc listen --port ${opts.port + 1}` })
          : new RccError(`Could not start the listener: ${err.message}`, { cause: err }),
      );
    });
    server.listen(opts.port, () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const url = `http://localhost:${port}/webhook`;
  log(`${green("●")} Listening on ${bold(url)}`);
  if (opts.authHeader !== undefined) log(dim(`  expecting Authorization: ${opts.authHeader}`));
  if (opts.forward !== undefined) log(dim(`  forwarding to ${opts.forward}`));
  log(dim(`  try: rcc send INITIAL_PURCHASE --to ${url}`));

  return {
    url,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function registerListen(program: Command, io: Io): void {
  program
    .command("listen")
    .description("Start a local HTTP server that receives, validates and pretty-prints webhook events.")
    .option("--port <n>", "port to listen on", (v: string) => Number(v), DEFAULT_PORT)
    .option("--forward <url>", "forward each request (body + Authorization) to this URL and relay its status")
    .option("--auth-header <value>", "expected Authorization header; mismatches are flagged and answered 401")
    .option("--verbose", "print the full JSON payload of each event", false)
    .addHelpText("after", `
Examples:
  $ rcc listen
  $ rcc listen --port 9000 --auth-header "Bearer dev" --verbose
  $ rcc listen --forward http://localhost:3000/webhook`)
    .action(async (opts: { port: number; forward?: string; authHeader?: string; verbose: boolean }) => {
      if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
        throw new RccError(`Invalid --port "${String(opts.port)}".`, { hint: "Use an integer between 1 and 65535." });
      }
      if (opts.forward !== undefined) assertUrl(opts.forward, "--forward");
      const listener = await startListener({ ...opts, io });
      const stop = (): void => {
        void listener.close().finally(() => process.exit(0));
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      await new Promise<void>(() => {
        /* run until killed */
      });
    });
}
