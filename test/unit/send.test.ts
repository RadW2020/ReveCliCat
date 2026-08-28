import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildProgram } from "../../src/program.js";
import { RccError } from "../../src/core/errors.js";
import { parseSetFlag } from "../../src/commands/send.js";
import { WebhookEnvelopeSchema } from "../../src/schemas/index.js";
import { Collector, startTestServer, type TestServer } from "../helpers/server.js";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.close());
beforeEach(() => {
  server.requests.length = 0;
  server.status = 200;
});

async function run(args: string[]): Promise<{ out: string; err: string; error?: RccError }> {
  const out = new Collector();
  const err = new Collector();
  const program = buildProgram({ stdout: out, stderr: err });
  program.exitOverride();
  try {
    await program.parseAsync(["node", "rcc", ...args]);
  } catch (e) {
    if (e instanceof RccError) return { out: out.text, err: err.text, error: e };
    throw e;
  }
  return { out: out.text, err: err.text };
}

describe("T-020 rcc send", () => {
  it("POSTs a valid envelope with JSON content type and reports status + latency", async () => {
    const { out, error } = await run(["send", "INITIAL_PURCHASE", "--to", server.url]);
    expect(error).toBeUndefined();
    expect(server.requests).toHaveLength(1);
    const req = server.requests[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("/webhook");
    expect(req.headers["content-type"]).toBe("application/json");
    const env = WebhookEnvelopeSchema.parse(req.body);
    expect(env.api_version).toBe("1.0");
    expect(env.event.type).toBe("INITIAL_PURCHASE");
    expect(env.event.environment).toBe("SANDBOX");
    expect(env.event.store).toBe("APP_STORE");
    expect(out).toMatch(/INITIAL_PURCHASE/);
    expect(out).toMatch(/200/);
    expect(out).toMatch(/\d+ ms/);
  });

  it("runs a coherent prelude so any event type can be sent alone", async () => {
    for (const type of ["RENEWAL", "CANCELLATION", "UNCANCELLATION", "BILLING_ISSUE", "EXPIRATION", "TEST"]) {
      server.requests.length = 0;
      const { error } = await run(["send", type, "--to", server.url, "--seed", "1"]);
      expect(error, type).toBeUndefined();
      expect(server.requests).toHaveLength(1);
      expect(WebhookEnvelopeSchema.parse(server.requests[0]!.body).event.type).toBe(type);
    }
  });

  it("unseeded events are timestamped near now", async () => {
    await run(["send", "RENEWAL", "--to", server.url]);
    const env = WebhookEnvelopeSchema.parse(server.requests[0]!.body);
    expect(Math.abs(env.event.event_timestamp_ms - Date.now())).toBeLessThan(60_000);
  });

  it("honours --user, --product, --environment, --auth-header and --set", async () => {
    const { error } = await run([
      "send", "RENEWAL", "--to", server.url,
      "--user", "user_42", "--product", "com.acme.gold", "--environment", "PRODUCTION",
      "--auth-header", "Bearer secret", "--set", "price=4.99", "--set", "subscriber_attributes.plan.value=pro",
      "--set", "subscriber_attributes.plan.updated_at_ms=1",
    ]);
    expect(error).toBeUndefined();
    const req = server.requests[0]!;
    expect(req.headers["authorization"]).toBe("Bearer secret");
    const env = WebhookEnvelopeSchema.parse(req.body);
    expect(env.event.app_user_id).toBe("user_42");
    expect(env.event.product_id).toBe("com.acme.gold");
    expect(env.event.environment).toBe("PRODUCTION");
    expect(env.event.price).toBe(4.99);
    expect(env.event.subscriber_attributes).toEqual({ plan: { value: "pro", updated_at_ms: 1 } });
  });

  it("--dry-run prints the envelope and sends nothing", async () => {
    const { out, error } = await run(["send", "CANCELLATION", "--dry-run", "--to", server.url]);
    expect(error).toBeUndefined();
    expect(server.requests).toHaveLength(0);
    const env = WebhookEnvelopeSchema.parse(JSON.parse(out));
    expect(env.event.type).toBe("CANCELLATION");
  });

  it("--seed makes dry-run output identical across runs", async () => {
    const a = await run(["send", "RENEWAL", "--dry-run", "--seed", "abc"]);
    const b = await run(["send", "RENEWAL", "--dry-run", "--seed", "abc"]);
    expect(a.out).toBe(b.out);
  });

  it("unknown event type lists the valid ones", async () => {
    const { error } = await run(["send", "REFUND", "--to", server.url]);
    expect(error).toBeInstanceOf(RccError);
    expect(error!.message).toMatch(/REFUND/);
    expect(error!.message).toMatch(/INITIAL_PURCHASE/);
    expect(error!.message).toMatch(/EXPIRATION/);
  });

  it("invalid --environment / --store list allowed values", async () => {
    const env = await run(["send", "TEST", "--environment", "prod", "--to", server.url]);
    expect(env.error!.message).toMatch(/SANDBOX/);
    const store = await run(["send", "TEST", "--store", "play_store", "--to", server.url]);
    expect(store.error!.message).toMatch(/app_store/);
  });

  it("schema-invalid --set fails with the path and a hint", async () => {
    const { error } = await run(["send", "TEST", "--set", "price=abc", "--to", server.url]);
    expect(error!.message).toMatch(/price/);
    expect(error!.hint).toBeDefined();
    const bad = await run(["send", "TEST", "--set", "novalue", "--to", server.url]);
    expect(bad.error!.message).toMatch(/key=value/);
  });

  it("connection refused gives an actionable message", async () => {
    const { error } = await run(["send", "TEST", "--to", "http://127.0.0.1:1/webhook"]);
    expect(error!.message).toMatch(/Could not reach http:\/\/127\.0\.0\.1:1\/webhook/);
    expect(error!.message).toMatch(/rcc listen/);
  });

  it("non-2xx response exits 1 and shows the status", async () => {
    server.status = 500;
    const { error, out } = await run(["send", "TEST", "--to", server.url]);
    expect(error).toBeInstanceOf(RccError);
    expect(error!.exitCode).toBe(1);
    expect(error!.message + out).toMatch(/500/);
  });
});

describe("T-020 parseSetFlag", () => {
  it("parses JSON-ish values and falls back to strings", () => {
    expect(parseSetFlag(["price=9.99", "flag=true", "n=null", "s=UNSUBSCRIBE", "q=\"123\"", "eq=a=b"])).toEqual({
      price: 9.99,
      flag: true,
      n: null,
      s: "UNSUBSCRIBE",
      q: "123",
      eq: "a=b",
    });
  });
});
