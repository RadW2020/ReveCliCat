import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startListener, type Listener } from "../../src/commands/listen.js";
import { Collector, startTestServer, type TestServer } from "../helpers/server.js";

const FIX = join(import.meta.dirname, "../fixtures/events");
const renewal = readFileSync(join(FIX, "RENEWAL.json"), "utf8");

const open: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

async function listener(opts: Partial<Parameters<typeof startListener>[0]> = {}): Promise<{ l: Listener; out: Collector }> {
  const out = new Collector();
  const l = await startListener({ port: 0, io: { stdout: out, stderr: out }, ...opts });
  open.push(l);
  return { l, out };
}

const post = (url: string, body: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("T-021 rcc listen", () => {
  it("listens on a port, prints the URL and logs valid events on one line", async () => {
    const { l, out } = await listener();
    expect(l.url).toMatch(/^http:\/\/localhost:\d+\/webhook$/);
    expect(out.text).toContain(l.url);
    const res = await post(l.url, renewal);
    expect(res.status).toBe(200);
    const lines = out.text.trim().split("\n");
    const line = lines.at(-1)!;
    expect(line).toMatch(/RENEWAL/);
    expect(line).toMatch(/1234567890/); // app_user_id
    expect(line).toMatch(/com\.subscription\.weekly/); // product_id
    expect(line).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(out.text).not.toContain('"event_timestamp_ms"');
  });

  it("--verbose prints the full JSON payload", async () => {
    const { l, out } = await listener({ verbose: true });
    await post(l.url, renewal);
    expect(out.text).toContain('"event_timestamp_ms"');
    expect(out.text).toContain('"type": "RENEWAL"');
  });

  it("marks invalid envelopes INVALID with the reason and answers 400", async () => {
    const { l, out } = await listener();
    const res = await post(l.url, JSON.stringify({ api_version: "1.0", event: { type: "RENEWAL" } }));
    expect(res.status).toBe(400);
    expect(out.text).toMatch(/INVALID/);
    expect(out.text).toMatch(/app_user_id/);
    const garbage = await post(l.url, "{not json");
    expect(garbage.status).toBe(400);
    expect(out.text).toMatch(/JSON/);
  });

  it("--auth-header: mismatches are flagged AUTH MISMATCH and answered 401; matches get 200", async () => {
    const { l, out } = await listener({ authHeader: "Bearer dev" });
    expect((await post(l.url, renewal)).status).toBe(401);
    expect((await post(l.url, renewal, { authorization: "Bearer nope" })).status).toBe(401);
    expect(out.text).toMatch(/AUTH MISMATCH/);
    expect((await post(l.url, renewal, { authorization: "Bearer dev" })).status).toBe(200);
  });

  it("--forward re-POSTs body and Authorization, and answers with the forwarded status", async () => {
    const upstream: TestServer = await startTestServer(202);
    open.push(upstream);
    const { l, out } = await listener({ forward: upstream.url });
    const res = await post(l.url, renewal, { authorization: "Bearer dev" });
    expect(res.status).toBe(202);
    expect(upstream.requests).toHaveLength(1);
    expect(upstream.requests[0]!.raw).toBe(renewal);
    expect(upstream.requests[0]!.headers["authorization"]).toBe("Bearer dev");
    expect(out.text).toMatch(/202/);
    expect(out.text).toMatch(/→/);
  });

  it("--forward to an unreachable upstream answers 502 and logs the failure", async () => {
    const { l, out } = await listener({ forward: "http://127.0.0.1:1/webhook" });
    const res = await post(l.url, renewal);
    expect(res.status).toBe(502);
    expect(out.text).toMatch(/forward failed/i);
  });

  it("non-POST or unknown method answers 404 JSON", async () => {
    const { l } = await listener();
    const res = await fetch(l.url, { method: "GET" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/POST/);
  });

  it("port already in use → actionable error", async () => {
    const { l } = await listener();
    await expect(startListener({ port: l.port, io: { stdout: new Collector(), stderr: new Collector() } })).rejects.toThrow(/in use/);
  });
});
