/**
 * Zod schemas for RevenueCat webhook events (v0.1: 7 event types).
 * Field names, types and inclusion rules follow docs/payload-sources.md (official docs, 2026-08-29).
 * Objects are non-strict: RevenueCat may add fields without bumping api_version.
 */
import { z } from "zod";
import { CANCEL_REASONS, ENVIRONMENTS, EXPIRATION_REASONS, PERIOD_TYPES, STORES } from "./common.js";

const ms = z.int();
/** Doubles may be serialised as integers (e.g. `"price": 0`). */
const double = z.number();

export const SubscriberAttributeSchema = z.looseObject({
  value: z.string(),
  updated_at_ms: ms,
});

export const ExperimentSchema = z.looseObject({
  experiment_id: z.string(),
  experiment_variant: z.string(),
  enrolled_at_ms: ms.nullable(),
});

/** Common fields — every event type. `app_id` is absent for PROMOTIONAL store events. */
const common = {
  id: z.string(),
  event_timestamp_ms: ms,
  app_id: z.string().optional(),
};

/** Subscriber identity fields. */
const identity = {
  app_user_id: z.string(),
  original_app_user_id: z.string(),
  aliases: z.array(z.string()),
  subscriber_attributes: z.record(z.string(), SubscriberAttributeSchema).optional(),
  experiments: z.array(ExperimentSchema).optional(),
};

/** Subscription lifecycle fields. "Always" → required (nullable where documented); "Sometimes" → optional. */
const lifecycle = {
  product_id: z.string(),
  period_type: z.enum(PERIOD_TYPES),
  purchased_at_ms: ms,
  expiration_at_ms: ms.nullable(),
  environment: z.enum(ENVIRONMENTS),
  entitlement_id: z.string().nullable(),
  entitlement_ids: z.array(z.string()).nullable(),
  presented_offering_id: z.string().nullable(),
  transaction_id: z.string(),
  original_transaction_id: z.string(),
  is_family_share: z.boolean(),
  country_code: z.string(),
  store: z.enum(STORES).optional(),
  currency: z.string().nullable().optional(),
  price: double.nullable().optional(),
  price_in_purchased_currency: double.nullable().optional(),
  tax_percentage: double.nullable().optional(),
  commission_percentage: double.nullable().optional(),
  takehome_percentage: double.nullable().optional(),
  offer_code: z.string().nullable().optional(),
  renewal_number: z.int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  discount_percentage: double.nullable().optional(),
  discount_amount: double.nullable().optional(),
  discount_identifier: z.string().nullable().optional(),
};

const LifecycleEventBase = z.looseObject({ ...common, ...identity, ...lifecycle });

export const InitialPurchaseEventSchema = LifecycleEventBase.extend({ type: z.literal("INITIAL_PURCHASE") });

export const RenewalEventSchema = LifecycleEventBase.extend({
  type: z.literal("RENEWAL"),
  is_trial_conversion: z.boolean().optional(),
});

export const CancellationEventSchema = LifecycleEventBase.extend({
  type: z.literal("CANCELLATION"),
  cancel_reason: z.enum(CANCEL_REASONS),
});

export const UncancellationEventSchema = LifecycleEventBase.extend({ type: z.literal("UNCANCELLATION") });

export const BillingIssueEventSchema = LifecycleEventBase.extend({
  type: z.literal("BILLING_ISSUE"),
  grace_period_expiration_at_ms: ms.nullable(),
});

export const ExpirationEventSchema = LifecycleEventBase.extend({
  type: z.literal("EXPIRATION"),
  expiration_reason: z.enum(EXPIRATION_REASONS),
});

/** Make every field of a shape `.nullable().optional()` while keeping the key types. */
function nullableOptional<T extends Record<string, z.ZodType>>(shape: T): { [K in keyof T]: z.ZodOptional<z.ZodNullable<T[K]>> } {
  return Object.fromEntries(Object.entries(shape).map(([k, schema]) => [k, schema.nullable().optional()])) as {
    [K in keyof T]: z.ZodOptional<z.ZodNullable<T[K]>>;
  };
}

/**
 * VERIFIED against a real dashboard test event captured 2026-08-29 (test/fixtures/events/real/TEST.json).
 * RevenueCat publishes no sample; the real payload is "purchase-like" but every subscription-lifecycle
 * field may be null (transaction ids, prices, is_family_share, renewal_number, metadata...). Common and
 * subscriber-identity fields are always present.
 */
export const TestEventSchema = z.looseObject({
  type: z.literal("TEST"),
  ...common,
  ...identity,
  ...nullableOptional(lifecycle),
});

export const EVENT_SCHEMAS = {
  TEST: TestEventSchema,
  INITIAL_PURCHASE: InitialPurchaseEventSchema,
  RENEWAL: RenewalEventSchema,
  CANCELLATION: CancellationEventSchema,
  UNCANCELLATION: UncancellationEventSchema,
  BILLING_ISSUE: BillingIssueEventSchema,
  EXPIRATION: ExpirationEventSchema,
} as const;

export const EventSchema = z.discriminatedUnion("type", [
  TestEventSchema,
  InitialPurchaseEventSchema,
  RenewalEventSchema,
  CancellationEventSchema,
  UncancellationEventSchema,
  BillingIssueEventSchema,
  ExpirationEventSchema,
]);

/** `api_version` is a string ("1.0" today); newer versions must not hard-fail (docs: additive changes). */
export const WebhookEnvelopeSchema = z.looseObject({
  api_version: z.string(),
  event: EventSchema,
});

export type Event = z.infer<typeof EventSchema>;
export type WebhookEnvelope = z.infer<typeof WebhookEnvelopeSchema>;
export type InitialPurchaseEvent = z.infer<typeof InitialPurchaseEventSchema>;
export type RenewalEvent = z.infer<typeof RenewalEventSchema>;
export type CancellationEvent = z.infer<typeof CancellationEventSchema>;
export type UncancellationEvent = z.infer<typeof UncancellationEventSchema>;
export type BillingIssueEvent = z.infer<typeof BillingIssueEventSchema>;
export type ExpirationEvent = z.infer<typeof ExpirationEventSchema>;
export type TestEvent = z.infer<typeof TestEventSchema>;
export type LifecycleEvent = Exclude<Event, TestEvent>;
