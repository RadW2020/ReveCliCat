/**
 * Enumerations shared by schemas, the state machine and the CLI.
 * Values come from the official RevenueCat docs — see docs/payload-sources.md (S2, 2026-08-29).
 */

/** The 7 event types supported in v0.1. */
export const EVENT_TYPES = [
  "TEST",
  "INITIAL_PURCHASE",
  "RENEWAL",
  "CANCELLATION",
  "UNCANCELLATION",
  "BILLING_ISSUE",
  "EXPIRATION",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** `store` values as documented by RevenueCat. */
export const STORES = [
  "AMAZON",
  "APP_STORE",
  "MAC_APP_STORE",
  "PADDLE",
  "PLAY_STORE",
  "PROMOTIONAL",
  "RC_BILLING",
  "ROKU",
  "STRIPE",
  "TEST_STORE",
] as const;
export type Store = (typeof STORES)[number];

export const PERIOD_TYPES = ["TRIAL", "INTRO", "NORMAL", "PROMOTIONAL", "PREPAID"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const CANCEL_REASONS = [
  "UNSUBSCRIBE",
  "BILLING_ERROR",
  "DEVELOPER_INITIATED",
  "PRICE_INCREASE",
  "CUSTOMER_SUPPORT",
  "UNKNOWN",
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const EXPIRATION_REASONS = [...CANCEL_REASONS, "SUBSCRIPTION_PAUSED"] as const;
export type ExpirationReason = (typeof EXPIRATION_REASONS)[number];

/** CLI-facing store names (lowercase) → RevenueCat `store` values. Generator supports these; receivers accept every store. */
export const CLI_STORES = ["app_store", "play_store"] as const;
export type CliStore = (typeof CLI_STORES)[number];
export const CLI_STORE_TO_STORE: Record<CliStore, Store> = { app_store: "APP_STORE", play_store: "PLAY_STORE" };
/** Default product id per store (Play uses RevenueCat's `<subscription_id>:<base_plan_id>` format). */
export const DEFAULT_PRODUCT_ID: Record<CliStore, string> = { app_store: "com.example.premium.monthly", play_store: "com.example.premium:monthly" };
