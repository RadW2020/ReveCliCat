import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** Minimal stand-in for smee.io: GET /new → 302 to a channel; GET /<ch> (SSE) streams; POST /<ch> relays. */
export interface FakeSmee {
  origin: string;
  channel: string;
  /** Push a relayed request to all subscribers, smee-style. */
  emit(payload: Record<string, unknown>): void;
  /** Close every open SSE connection (simulates a drop) without stopping the server. */
  dropClients(): void;
  subscribers: number;
  posts: Array<{ headers: Record<string, string | string[] | undefined>; body: unknown }>;
  close(): Promise<void>;
}

export async function startFakeSmee(): Promise<FakeSmee> {
  const clients = new Set<ServerResponse>();
  const posts: FakeSmee["posts"] = [];
  let seq = 0;
  const channelId = "fakeChannel123";

  const server: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && url === "/new") {
      res.writeHead(302, { location: `${origin}/${channelId}` });
      res.end();
      return;
    }
    if (req.method === "GET" && url === `/${channelId}`) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(`id: ${seq}\nevent: ready\ndata: {}\n\n`);
      clients.add(res);
      res.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "POST" && url === `/${channelId}`) {
      let raw = "";
      req.on("data", (c: Buffer) => (raw += c.toString()));
      req.on("end", () => {
        let body: unknown = raw;
        try {
          body = JSON.parse(raw);
        } catch {
          /* raw */
        }
        posts.push({ headers: req.headers, body });
        const payload: Record<string, unknown> = { ...req.headers, body, query: {}, timestamp: Date.now() };
        emit(payload);
        res.writeHead(200);
        res.end("OK");
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  function emit(payload: Record<string, unknown>): void {
    seq++;
    // smee frames: `id:` then a single-line `data:` (JSON). Multi-line data is covered by the parser unit test.
    const frame = `id: ${seq}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of clients) c.write(frame);
  }

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    channel: `${origin}/${channelId}`,
    emit,
    dropClients: () => {
      for (const c of clients) c.destroy();
      clients.clear();
    },
    get subscribers() {
      return clients.size;
    },
    posts,
    close: () =>
      new Promise((r) => {
        for (const c of clients) c.destroy();
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
