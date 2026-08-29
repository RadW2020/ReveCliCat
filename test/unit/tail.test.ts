import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSmeeChannel, parseSseStream, startTail, type TailHandle } from "../../src/commands/tail.js";
import { RccError } from "../../src/core/errors.js";
import { Collector, startTestServer } from "../helpers/server.js";
import { startFakeSmee, type FakeSmee } from "../helpers/fake-smee.js";

const FIX = join(import.meta.dirname, "../fixtures/events");
const renewal = JSON.parse(readFileSync(join(FIX, "RENEWAL.json"), "utf8")) as Record<string, unknown>;

const open: Array<{ close(): Promise<void> | void }> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

const until = async (pred: () => boolean, ms = 5000): Promise<void> => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

async function tail(smee: FakeSmee, extra: Partial<Parameters<typeof startTail>[0]> = {}): Promise<{ h: TailHandle; out: Collector }> {
  const out = new Collector();
  const h = startTail({ source: { kind: "smee", url: smee.channel }, io: { stdout: out, stderr: out }, backoffMs: [50, 50], ...extra });
  open.push(h);
  await until(() => smee.subscribers === 1);
  return { h, out };
}

describe("T-061 parseSseStream", () => {
  const chunks = (parts: string[]): ReadableStream<Uint8Array> => ReadableStream.from(parts.map((p) => new TextEncoder().encode(p)));
  it("parses id/event/data frames, joins multi-line data, ignores comments and pings", async () => {
    const frames: Array<{ id?: string; event?: string; data: string }> = [];
    for await (const f of parseSseStream(chunks(["id: 1\nev", "ent: ready\ndata: {}\n\n: ping\n\nid: 2\ndata: {\"a\":\ndata: 1}\n\n"]))) frames.push(f);
    expect(frames).toEqual([
      { id: "1", event: "ready", data: "{}" },
      { id: "2", data: '{"a":\n1}' },
    ]);
  });
});

describe("T-061 createSmeeChannel", () => {
  it("follows the /new redirect and returns the channel URL", async () => {
    const smee = await startFakeSmee();
    open.push(smee);
    expect(await createSmeeChannel(smee.origin)).toBe(smee.channel);
  });
  it("fails actionably when the relay is unreachable", async () => {
    await expect(createSmeeChannel("http://127.0.0.1:1")).rejects.toThrow(RccError);
  });
});

describe("T-061 rcc tail --smee", () => {
  it("prints the channel URL with dashboard instructions and one line per real event", async () => {
    const smee = await startFakeSmee();
    open.push(smee);
    const { out } = await tail(smee);
    expect(out.text).toContain(smee.channel);
    expect(out.text).toMatch(/Integrations → Webhooks/);
    smee.emit({ authorization: "Bearer x", "content-type": "application/json", body: renewal, query: {}, timestamp: Date.now() });
    await until(() => /RENEWAL/.test(out.text));
    const line = out.text.trim().split("\n").at(-1)!;
    expect(line).toMatch(/real/);
    expect(line).toMatch(/RENEWAL\s+1234567890\s+com\.subscription\.weekly/);
    expect(out.text).not.toContain('"event_timestamp_ms"');
  });

  it("--verbose prints the body; invalid envelopes are flagged INVALID", async () => {
    const smee = await startFakeSmee();
    open.push(smee);
    const { out } = await tail(smee, { verbose: true });
    smee.emit({ body: { api_version: "1.0", event: { type: "RENEWAL" } }, timestamp: Date.now() });
    await until(() => /INVALID/.test(out.text));
    expect(out.text).toMatch(/event\.id/);
    smee.emit({ body: renewal, timestamp: Date.now() });
    await until(() => /"event_timestamp_ms"/.test(out.text));
  });

  it("--forward re-POSTs the body with the relayed Authorization header and shows the local status", async () => {
    const smee = await startFakeSmee();
    open.push(smee);
    const local = await startTestServer(200);
    open.push(local);
    const { out } = await tail(smee, { forward: local.url });
    smee.emit({ authorization: "Bearer from-revenuecat", body: renewal, timestamp: Date.now() });
    await until(() => local.requests.length === 1);
    expect(local.requests[0]!.headers["authorization"]).toBe("Bearer from-revenuecat");
    expect(local.requests[0]!.headers["content-type"]).toBe("application/json");
    expect(local.requests[0]!.body).toEqual(renewal);
    await until(() => /→ 200/.test(out.text));
    local.status = 500;
    smee.emit({ body: renewal, timestamp: Date.now() });
    await until(() => /→ 500/.test(out.text));
  });

  it("forward failures are reported but do not stop tailing", async () => {
    const smee = await startFakeSmee();
    open.push(smee);
    const { out } = await tail(smee, { forward: "http://127.0.0.1:1/webhook" });
    smee.emit({ body: renewal, timestamp: Date.now() });
    await until(() => /forward failed/i.test(out.text));
    smee.emit({ body: renewal, timestamp: Date.now() });
    await until(() => (out.text.match(/RENEWAL/g) ?? []).length >= 2);
  });

  it("reconnects after the stream drops", async () => {
    const smee = await startFakeSmee();
    open.push(smee);
    const { out } = await tail(smee);
    smee.dropClients();
    await until(() => smee.subscribers === 1, 5000);
    expect(out.text).toMatch(/reconnect/i);
    smee.emit({ body: renewal, timestamp: Date.now() });
    await until(() => /RENEWAL/.test(out.text));
  });

  it("stops cleanly on close()", async () => {
    const smee = await startFakeSmee();
    open.push(smee);
    const { h } = await tail(smee);
    await h.close();
    await until(() => smee.subscribers === 0);
  });
});
