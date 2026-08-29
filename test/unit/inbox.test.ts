import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startInbox, type Inbox, type InboxRecord } from "../../src/commands/inbox.js";
import { parseSseStream, startTail } from "../../src/commands/tail.js";
import { RccError } from "../../src/core/errors.js";
import { Collector, startTestServer } from "../helpers/server.js";

const FIX = join(import.meta.dirname, "../fixtures/events");
const renewal = readFileSync(join(FIX, "RENEWAL.json"), "utf8");
const cancellation = readFileSync(join(FIX, "CANCELLATION.json"), "utf8");

const open: Array<{ close(): Promise<void> | void }> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

async function inbox(extra: Partial<Parameters<typeof startInbox>[0]> = {}): Promise<{ box: Inbox; out: Collector; dir: string }> {
  const out = new Collector();
  const dir = mkdtempSync(join(tmpdir(), "rcc-inbox-"));
  const box = await startInbox({ port: 0, token: "secret-token", dataDir: dir, io: { stdout: out, stderr: out }, ...extra });
  open.push(box);
  return { box, out, dir };
}

const post = (url: string, body: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${url}/webhook`, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
const events = async (url: string, token = "secret-token", qs = ""): Promise<{ status: number; body: { events: InboxRecord[]; next: number } }> => {
  const res = await fetch(`${url}/events${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: (await res.json()) as { events: InboxRecord[]; next: number } };
};
const until = async (pred: () => boolean, ms = 5000): Promise<void> => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("T-062 rcc inbox — receiving", () => {
  it("requires a token", async () => {
    await expect(startInbox({ port: 0, token: "", dataDir: mkdtempSync(join(tmpdir(), "x-")), io: { stdout: new Collector(), stderr: new Collector() } })).rejects.toThrow(RccError);
  });

  it("stores valid events (200) with headers, body and seq; /health counts them", async () => {
    const { box, out } = await inbox();
    expect(out.text).toContain(box.url);
    expect((await post(box.url, renewal, { authorization: "Bearer rc" })).status).toBe(200);
    expect((await post(box.url, cancellation)).status).toBe(200);
    const { status, body } = await events(box.url);
    expect(status).toBe(200);
    expect(body.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(body.next).toBe(2);
    const first = body.events[0]!;
    expect(first.valid).toBe(true);
    expect(first.authOk).toBe(true);
    expect(first.headers["authorization"]).toBe("Bearer rc");
    expect(first.body).toBe(renewal);
    expect(first.receivedAt).toMatch(/^\d{4}-/);
    const health = (await (await fetch(`${box.url}/health`)).json()) as { ok: boolean; events: number };
    expect(health).toEqual({ ok: true, events: 2 });
  });

  it("auth mismatch → 401 but stored with authOk=false; matching → 200", async () => {
    const { box } = await inbox({ authHeader: "Bearer rc" });
    expect((await post(box.url, renewal)).status).toBe(401);
    expect((await post(box.url, renewal, { authorization: "Bearer nope" })).status).toBe(401);
    expect((await post(box.url, renewal, { authorization: "Bearer rc" })).status).toBe(200);
    const { body } = await events(box.url);
    expect(body.events.map((e) => e.authOk)).toEqual([false, false, true]);
  });

  it("non-JSON → 400 stored invalid; schema-invalid JSON → 200 stored with issues", async () => {
    const { box } = await inbox();
    expect((await post(box.url, "{nope")).status).toBe(400);
    expect((await post(box.url, JSON.stringify({ api_version: "1.0", event: { type: "RENEWAL" } }))).status).toBe(200);
    const { body } = await events(box.url);
    expect(body.events[0]!.valid).toBe(false);
    expect(body.events[1]!.valid).toBe(false);
    expect(body.events[1]!.issues!.some((i) => i.path === "event.id")).toBe(true);
  });

  it("retries with the same event.id are stored and linked with duplicateOf", async () => {
    const { box } = await inbox();
    await post(box.url, renewal);
    await post(box.url, renewal);
    const { body } = await events(box.url);
    expect(body.events[1]!.duplicateOf).toBe(1);
    expect(body.events[0]!.duplicateOf).toBeUndefined();
  });

  it("non-POST /webhook and unknown paths → 404 JSON", async () => {
    const { box } = await inbox();
    expect((await fetch(`${box.url}/webhook`)).status).toBe(404);
    expect((await fetch(`${box.url}/nope`)).status).toBe(404);
  });
});

describe("T-062 rcc inbox — reading", () => {
  it("/events requires the bearer token; supports since & limit", async () => {
    const { box } = await inbox();
    for (let i = 0; i < 5; i++) await post(box.url, renewal);
    expect((await events(box.url, "")).status).toBe(401);
    expect((await events(box.url, "wrong")).status).toBe(401);
    const page = await events(box.url, "secret-token", "?since=2&limit=2");
    expect(page.body.events.map((e) => e.seq)).toEqual([3, 4]);
    expect(page.body.next).toBe(4);
    const rest = await events(box.url, "secret-token", `?since=${page.body.next}`);
    expect(rest.body.events.map((e) => e.seq)).toEqual([5]);
  });

  it("/events/stream replays from since and pushes new records (token via header or ?token=)", async () => {
    const { box } = await inbox();
    await post(box.url, renewal);
    const res = await fetch(`${box.url}/events/stream?since=0&token=secret-token`, { headers: { accept: "text/event-stream" } });
    expect(res.status).toBe(200);
    const got: InboxRecord[] = [];
    const reader = (async () => {
      for await (const f of parseSseStream(res.body!)) {
        if (f.event === "webhook") got.push(JSON.parse(f.data) as InboxRecord);
        if (got.length === 2) break;
      }
    })();
    await until(() => got.length === 1);
    await post(box.url, cancellation);
    await reader;
    expect(got.map((e) => e.seq)).toEqual([1, 2]);
    expect((await fetch(`${box.url}/events/stream`)).status).toBe(401);
  });

  it("persists to JSONL and resumes seq after restart; --max-events compacts", async () => {
    const { box, dir } = await inbox({ maxEvents: 3 });
    for (let i = 0; i < 5; i++) await post(box.url, renewal);
    expect(existsSync(join(dir, "events.jsonl"))).toBe(true);
    await box.close();
    open.pop();
    const again = await startInbox({ port: 0, token: "secret-token", dataDir: dir, maxEvents: 3, io: { stdout: new Collector(), stderr: new Collector() } });
    open.push(again);
    const { body } = await events(again.url);
    expect(body.events.map((e) => e.seq)).toEqual([3, 4, 5]);
    await post(again.url, renewal);
    expect((await events(again.url)).body.events.map((e) => e.seq)).toEqual([4, 5, 6]);
  });
});

describe("T-062 rcc tail --inbox", () => {
  it("follows the inbox stream, prints events and forwards them; 401 is actionable", async () => {
    const { box } = await inbox();
    const local = await startTestServer(200);
    open.push(local);
    const out = new Collector();
    const h = startTail({ source: { kind: "inbox", url: box.url, token: "secret-token" }, forward: local.url, io: { stdout: out, stderr: out }, backoffMs: [50] });
    open.push(h);
    await until(() => box.subscribers === 1);
    await post(box.url, renewal, { authorization: "Bearer rc" });
    await until(() => /RENEWAL/.test(out.text));
    expect(out.text).toMatch(/real\s+RENEWAL\s+1234567890/);
    await until(() => local.requests.length === 1);
    expect(local.requests[0]!.headers["authorization"]).toBe("Bearer rc");
    expect(local.requests[0]!.raw).toBe(renewal);

    const bad = new Collector();
    const h2 = startTail({ source: { kind: "inbox", url: box.url, token: "wrong" }, io: { stdout: bad, stderr: bad }, backoffMs: [50] });
    open.push(h2);
    await until(() => /--token/.test(bad.text));
  });

  it("--all replays history before following", async () => {
    const { box } = await inbox();
    await post(box.url, renewal);
    await post(box.url, cancellation);
    const out = new Collector();
    const h = startTail({ source: { kind: "inbox", url: box.url, token: "secret-token", since: 0 }, io: { stdout: out, stderr: out }, backoffMs: [50] });
    open.push(h);
    await until(() => /CANCELLATION/.test(out.text));
    expect(out.text.indexOf("RENEWAL")).toBeLessThan(out.text.indexOf("CANCELLATION"));
  });
});

describe("T-065 inbox accepts unknown event types", () => {
  it("stores them as valid with eventType and answers 200", async () => {
    const { box } = await inbox();
    const body = readFileSync(join(FIX, "real/NON_RENEWING_PURCHASE.promotional.json"), "utf8");
    expect((await post(box.url, body)).status).toBe(200);
    const { body: page } = await events(box.url);
    expect(page.events[0]!.valid).toBe(true);
    expect(page.events[0]!.eventType).toBe("NON_RENEWING_PURCHASE");
    expect(page.events[0]!.unsupportedType).toBe(true);
  });
});
