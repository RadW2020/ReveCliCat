/**
 * Enumerations shared by schemas, the state machine and the CLI.
 * Values come from the official RevenueCat docs — see docs/payload-sources.md.
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

/** CLI-facing store names (lowercase) → RevenueCat `store` values. v0.1 supports app_store only (see Icebox). */
export const CLI_STORES = ["app_store"] as const;
export type CliStore = (typeof CLI_STORES)[number];
