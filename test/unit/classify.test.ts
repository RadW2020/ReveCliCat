import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyEnvelope } from "../../src/schemas/index.js";

const FIX = join(import.meta.dirname, "../fixtures/events");
const load = (rel: string): unknown => JSON.parse(readFileSync(join(FIX, rel), "utf8"));

describe("T-065 classifyEnvelope", () => {
  it("known types → known", () => {
    const c = classifyEnvelope(load("RENEWAL.json"));
    expect(c.kind).toBe("known");
    if (c.kind === "known") expect(c.envelope.event.type).toBe("RENEWAL");
  });
  it("a real NON_RENEWING_PURCHASE and a made-up FUTURE_EVENT → unknown-type (well-formed)", () => {
    const real = classifyEnvelope(load("real/NON_RENEWING_PURCHASE.promotional.json"));
    expect(real.kind).toBe("unknown-type");
    if (real.kind === "unknown-type") {
      expect(real.type).toBe("NON_RENEWING_PURCHASE");
      expect(real.envelope.event.app_user_id).toBe("rcc_promo_test");
    }
    const future = classifyEnvelope({ api_version: "1.0", event: { type: "FUTURE_EVENT", id: "x", event_timestamp_ms: 1, app_user_id: "u", original_app_user_id: "u", aliases: ["u"], whatever: 1 } });
    expect(future.kind).toBe("unknown-type");
  });
  it("garbage or missing common fields → invalid with issues", () => {
    const c = classifyEnvelope({ api_version: "1.0", event: { type: "FUTURE_EVENT" } });
    expect(c.kind).toBe("invalid");
    if (c.kind === "invalid") expect(c.issues.some((i) => i.path === "event.id")).toBe(true);
    expect(classifyEnvelope("nope").kind).toBe("invalid");
    expect(classifyEnvelope({ api_version: "1.0", event: { ...(load("RENEWAL.json") as { event: object }).event, type: "RENEWAL", store: "NOPE" } }).kind).toBe("invalid");
  });
});
