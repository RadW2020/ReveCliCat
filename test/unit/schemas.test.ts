import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BillingIssueEventSchema,
  CancellationEventSchema,
  EVENT_SCHEMAS,
  EventSchema,
  ExpirationEventSchema,
  InitialPurchaseEventSchema,
  RenewalEventSchema,
  TestEventSchema,
  UncancellationEventSchema,
  WebhookEnvelopeSchema,
  type Event,
  type WebhookEnvelope,
} from "../../src/schemas/index.js";
import { EVENT_TYPES } from "../../src/schemas/common.js";

const FIX = join(import.meta.dirname, "../fixtures/events");
const load = (name: string): WebhookEnvelope => JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8")) as WebhookEnvelope;
const evt = (name: string): Record<string, unknown> => load(name).event;

describe("T-003 fixtures validate against their schema and the union", () => {
  it.each(EVENT_TYPES)("%s", (type) => {
    const fixture = load(type);
    const envelope = WebhookEnvelopeSchema.parse(fixture);
    expect(envelope.event.type).toBe(type);
    expect(EVENT_SCHEMAS[type].parse(fixture.event).type).toBe(type);
    const event: Event = EventSchema.parse(fixture.event);
    expect(event.type).toBe(type);
  });

  it("accepts the envelope example from the docs (different key order)", () => {
    const parsed = WebhookEnvelopeSchema.parse(load("envelope-example"));
    expect(parsed.event.type).toBe("INITIAL_PURCHASE");
  });

  it("passes unknown keys through (forward compatibility)", () => {
    const parsed = EventSchema.parse({ ...evt("RENEWAL"), some_future_field: 1 }) as unknown as Record<string, unknown>;
    expect(parsed["some_future_field"]).toBe(1);
  });

  it("accepts a newer api_version string but not a number", () => {
    expect(WebhookEnvelopeSchema.safeParse({ ...load("RENEWAL"), api_version: "1.1" }).success).toBe(true);
    expect(WebhookEnvelopeSchema.safeParse({ ...load("RENEWAL"), api_version: 1 }).success).toBe(false);
  });
});

describe("T-003 negative cases name the offending path", () => {
  const base = evt("INITIAL_PURCHASE");
  const issuePaths = (input: unknown): string[] => {
    const r = EventSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
  };

  it("wrong type", () => {
    expect(issuePaths({ ...base, type: "REFUND" })).toContain("type");
  });
  it("missing app_user_id", () => {
    const { app_user_id: _omit, ...rest } = base;
    expect(issuePaths(rest)).toContain("app_user_id");
  });
  it("invalid store value", () => {
    expect(issuePaths({ ...base, store: "app_store" })).toContain("store");
  });
  it("non-integer ms timestamps", () => {
    expect(issuePaths({ ...base, purchased_at_ms: 1.5 })).toContain("purchased_at_ms");
    expect(issuePaths({ ...base, event_timestamp_ms: "123" })).toContain("event_timestamp_ms");
  });
  it("invalid enum values", () => {
    expect(issuePaths({ ...base, environment: "sandbox" })).toContain("environment");
    expect(issuePaths({ ...base, period_type: "FREE" })).toContain("period_type");
  });
});

describe("T-003 event-specific fields", () => {
  it("CANCELLATION requires a valid cancel_reason", () => {
    const { cancel_reason: _omit, ...noReason } = evt("CANCELLATION");
    expect(CancellationEventSchema.safeParse(noReason).success).toBe(false);
    expect(CancellationEventSchema.safeParse({ ...noReason, cancel_reason: "SUBSCRIPTION_PAUSED" }).success).toBe(false);
    expect(CancellationEventSchema.safeParse({ ...noReason, cancel_reason: "BILLING_ERROR" }).success).toBe(true);
  });
  it("EXPIRATION requires a valid expiration_reason (SUBSCRIPTION_PAUSED allowed)", () => {
    const { expiration_reason: _omit, ...noReason } = evt("EXPIRATION");
    expect(ExpirationEventSchema.safeParse(noReason).success).toBe(false);
    expect(ExpirationEventSchema.safeParse({ ...noReason, expiration_reason: "SUBSCRIPTION_PAUSED" }).success).toBe(true);
  });
  it("RENEWAL is_trial_conversion is an optional boolean", () => {
    const ev = evt("RENEWAL");
    expect(RenewalEventSchema.safeParse({ ...ev, is_trial_conversion: "yes" }).success).toBe(false);
    const { is_trial_conversion: _omit, ...without } = ev;
    expect(RenewalEventSchema.safeParse(without).success).toBe(true);
  });
  it("BILLING_ISSUE requires grace_period_expiration_at_ms (nullable)", () => {
    const ev = evt("BILLING_ISSUE");
    const { grace_period_expiration_at_ms: _omit, ...without } = ev;
    expect(BillingIssueEventSchema.safeParse(without).success).toBe(false);
    expect(BillingIssueEventSchema.safeParse({ ...ev, grace_period_expiration_at_ms: null }).success).toBe(true);
  });
  it("nullable Always fields accept null; Doubles accept integers; subscriber_attributes may be {} or absent", () => {
    const ev = evt("UNCANCELLATION");
    expect(UncancellationEventSchema.safeParse({ ...ev, expiration_at_ms: null, entitlement_ids: null, price: 0 }).success).toBe(true);
    const { subscriber_attributes: _omit, ...without } = ev;
    expect(UncancellationEventSchema.safeParse(without).success).toBe(true);
    expect(UncancellationEventSchema.safeParse({ ...ev, subscriber_attributes: { plan: { value: "pro" } } }).success).toBe(false);
  });
  it("app_id is optional (PROMOTIONAL store)", () => {
    const { app_id: _omit, ...without } = evt("INITIAL_PURCHASE");
    expect(InitialPurchaseEventSchema.safeParse(without).success).toBe(true);
  });
  it("TEST (PROVISIONAL) tolerates missing lifecycle fields but requires the common ones", () => {
    expect(
      TestEventSchema.safeParse({ type: "TEST", id: "x", event_timestamp_ms: 1, app_user_id: "u", original_app_user_id: "u", aliases: ["u"] }).success,
    ).toBe(true);
    expect(TestEventSchema.safeParse({ type: "TEST", id: "x" }).success).toBe(false);
  });
});

describe("T-004 real captured payloads validate", () => {
  it("the dashboard TEST event (2026-08-29) validates: lifecycle fields may all be null", () => {
    const real = JSON.parse(readFileSync(join(FIX, "real/TEST.json"), "utf8")) as WebhookEnvelope;
    const env = WebhookEnvelopeSchema.safeParse(real);
    expect(env.success, JSON.stringify(env.success ? null : env.error.issues.slice(0, 3))).toBe(true);
    const ev = TestEventSchema.parse(real.event);
    expect(ev.store).toBe("PLAY_STORE");
    expect(ev.transaction_id).toBeNull();
    expect(ev.is_family_share).toBeNull();
    expect(ev.renewal_number).toBeNull();
    expect(ev.metadata).toBeNull();
    expect(ev.app_user_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("T-064 real lifecycle payloads (store PROMOTIONAL) validate", () => {
  it.each(["CANCELLATION", "EXPIRATION"])("%s.promotional.json", (type) => {
    const real = JSON.parse(readFileSync(join(FIX, `real/${type}.promotional.json`), "utf8")) as WebhookEnvelope;
    const r = WebhookEnvelopeSchema.safeParse(real);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues.slice(0, 4))).toBe(true);
    if (!r.success) return;
    expect(r.data.event.type).toBe(type);
    expect(r.data.event.is_family_share).toBeNull();
    expect(r.data.event.country_code).toBeNull();
    expect(r.data.event.store).toBe("PROMOTIONAL");
  });
});
