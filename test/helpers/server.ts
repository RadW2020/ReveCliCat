import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Captured {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingMessage["headers"];
  body: unknown;
  raw: string;
}

export interface TestServer {
  url: string;
  port: number;
  requests: Captured[];
  close(): Promise<void>;
  /** Status the next responses will use. */
  status: number;
  delayMs: number;
}

/** Tiny capture server for command tests. Responds `status` (default 200) with `{ok:true}`. */
export async function startTestServer(status = 200): Promise<TestServer> {
  const requests: Captured[] = [];
  const state = { status, delayMs: 0 };
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        /* keep raw */
      }
      requests.push({ method: req.method, url: req.url, headers: req.headers, body, raw });
      setTimeout(() => {
        res.writeHead(state.status, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: state.status < 300 }));
      }, state.delayMs);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/webhook`,
    port,
    requests,
    close: () => new Promise((r) => server.close(() => r())),
    get status() {
      return state.status;
    },
    set status(v: number) {
      state.status = v;
    },
    get delayMs() {
      return state.delayMs;
    },
    set delayMs(v: number) {
      state.delayMs = v;
    },
  };
}

/** Collects writes so command output can be asserted. */
export class Collector {
  chunks: string[] = [];
  write = (s: string): boolean => {
    this.chunks.push(s);
    return true;
  };
  get text(): string {
    return this.chunks.join("");
  }
}
