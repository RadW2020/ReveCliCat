import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../examples/express-handler.js";

const FIX = join(import.meta.dirname, "../fixtures/events");
const renewal = readFileSync(join(FIX, "RENEWAL.json"), "utf8");

let server: Server;
let url: string;
const seen: string[] = [];

beforeAll(async () => {
  const app = createApp({ authHeader: "Bearer dev", onEvent: (e) => {
      seen.push(e.type);
    },
  });
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const post = (body: string, auth?: string): Promise<Response> =>
  fetch(`${url}/webhook`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...(auth === undefined ? {} : { authorization: auth }) },
  });

describe("T-041 examples/express-handler.ts", () => {
  it("accepts a valid event once and dedupes the retry by event.id", async () => {
    const first = await post(renewal, "Bearer dev");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    const again = await post(renewal, "Bearer dev");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, deduped: true });
    expect(seen).toEqual(["RENEWAL"]);
  });

  it("rejects a wrong or missing Authorization header with 401", async () => {
    expect((await post(renewal)).status).toBe(401);
    expect((await post(renewal, "Bearer nope")).status).toBe(401);
  });

  it("rejects garbage and invalid envelopes with 400", async () => {
    expect((await post("{not json", "Bearer dev")).status).toBe(400);
    const res = await post(JSON.stringify({ api_version: "1.0", event: { type: "RENEWAL" } }), "Bearer dev");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Invalid/);
  });

  it("exposes GET /health", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
  });

  it("works without an auth header configured", async () => {
    const open = createApp({});
    const s = open.listen(0);
    await new Promise<void>((r) => s.once("listening", r));
    const p = (s.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${p}/webhook`, { method: "POST", body: renewal, headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    await new Promise<void>((r) => s.close(() => r()));
  });
});
