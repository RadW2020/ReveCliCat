import { addDuration, formatDuration, parseDuration, type Duration, type VirtualClock } from "./clock.js";
import { RccError } from "./errors.js";
import type { Rng } from "./rng.js";
import { applyOverrides } from "./set-path.js";
import { transition, type SubscriptionState } from "./state-machine.js";
import {
  CLI_STORE_TO_STORE,
  DEFAULT_PRODUCT_ID,
  EVENT_SCHEMAS,
  type CliStore,
  type Environment,
  type Event,
  type EventType,
  type PeriodType,
} from "../schemas/index.js";

export interface SubscriberOptions {
  /** "auto" → `$RCAnonymousID:<32 hex>` from the RNG. */
  appUserId?: string | undefined;
  /** Defaults per store: `com.example.premium.monthly` (App Store), `com.example.premium:monthly` (Play). */
  productId?: string | undefined;
  period: string | Duration;
  /** Free-trial length; omit for no trial. */
  trial?: string | Duration | undefined;
  /** Billing-retry grace period (default P16D). */
  gracePeriod?: string | Duration | undefined;
  store?: CliStore | undefined;
  environment?: Environment | undefined;
  price?: number | undefined;
  currency?: string | undefined;
  countryCode?: string | undefined;
  entitlementIds?: string[] | undefined;
  appId?: string | undefined;
}

export interface SubscriberDeps {
  clock: VirtualClock;
  rng: Rng;
}

export class PrematureEventError extends RccError {
  constructor(event: EventType, nowMs: number, dueMs: number) {
    const remaining = msToDuration(dueMs - nowMs);
    super(
      `Cannot emit ${event} yet: the virtual clock is at ${new Date(nowMs).toISOString()} ` +
        `but the subscription runs until ${new Date(dueMs).toISOString()}. ` +
        `Add \`advance: ${remaining}\` (or more) before this step.`,
      { hint: "The virtual clock must reach expiration_at_ms (or the end of the grace period) before EXPIRATION." },
    );
    this.name = "PrematureEventError";
  }
}

function msToDuration(ms: number): string {
  const days = Math.ceil(ms / 86_400_000);
  if (days >= 1) return `P${days}D`;
  return formatDuration({ ...parseDuration("PT1S"), seconds: Math.max(1, Math.ceil(ms / 1000)) });
}

const asDuration = (d: string | Duration): Duration => (typeof d === "string" ? parseDuration(d) : d);

/**
 * Simulates one subscriber. Owns the state machine, the identity, and the current billing period,
 * and turns event types into schema-valid RevenueCat payloads.
 */
export class Subscriber {
  readonly history: Event[] = [];

  private _state: SubscriptionState = "none";
  private resumeState: "trial" | "active" = "active";

  private readonly period: Duration;
  private readonly trial: Duration | undefined;
  private readonly grace: Duration;
  private readonly store;
  private readonly cliStore: CliStore;
  /** Play: number of renewals on the current order (drives the `..N` suffix). */
  private renewalIndex = 0;
  private readonly environment: Environment;
  private readonly price: number;
  private readonly currency: string;
  private readonly countryCode: string;
  private readonly entitlementIds: string[];
  private readonly productId: string;

  private readonly appUserId: string;
  private readonly appId: string;
  private originalTransactionId: string | undefined;
  private transactionId: string | undefined;
  private purchasedAtMs: number | undefined;
  private expirationAtMs: number | undefined;
  private periodType: PeriodType = "NORMAL";
  private gracePeriodExpirationAtMs: number | null = null;

  constructor(
    opts: SubscriberOptions,
    private readonly deps: SubscriberDeps,
  ) {
    this.period = asDuration(opts.period);
    this.trial = opts.trial === undefined ? undefined : asDuration(opts.trial);
    this.grace = asDuration(opts.gracePeriod ?? "P16D");
    this.cliStore = opts.store ?? "app_store";
    this.store = CLI_STORE_TO_STORE[this.cliStore];
    this.environment = opts.environment ?? "SANDBOX";
    this.price = opts.price ?? 9.99;
    this.currency = opts.currency ?? "USD";
    this.countryCode = opts.countryCode ?? "US";
    this.entitlementIds = opts.entitlementIds ?? ["premium"];
    this.productId = opts.productId ?? DEFAULT_PRODUCT_ID[this.cliStore];
    this.appUserId =
      opts.appUserId === undefined || opts.appUserId === "auto" ? `$RCAnonymousID:${deps.rng.hex(32)}` : opts.appUserId;
    this.appId = opts.appId ?? `app${deps.rng.hex(12)}`;
  }

  get state(): SubscriptionState {
    return this._state;
  }

  /** Current period end (ms) or undefined before the first purchase. */
  get expiresAt(): number | undefined {
    return this.expirationAtMs;
  }

  /** Emit an event: check legality, time guards, build + validate payload, commit state. */
  emit(type: EventType, overrides: Record<string, unknown> = {}): Event {
    const from = this._state;
    const next = transition(from, type, { hasTrial: this.trial !== undefined, resumeState: this.resumeState });
    const now = this.deps.clock.now();

    if (type === "EXPIRATION") {
      const due = Math.max(this.expirationAtMs ?? 0, from === "billing_issue" ? (this.gracePeriodExpirationAtMs ?? 0) : 0);
      if (now < due) throw new PrematureEventError(type, now, due);
    }

    // Work on a draft of the mutable period fields; commit only after validation.
    const draft = this.draftFor(type, from, now);
    const payload = applyOverrides(this.buildPayload(type, from, now, draft), overrides);
    const result = EVENT_SCHEMAS[type].safeParse(payload);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      throw new RccError(`Generated ${type} payload is invalid at "${issue.path.join(".")}": ${issue.message}`, {
        hint: "Check your --set / set: overrides against the RevenueCat field types (docs/payload-sources.md).",
      });
    }

    if (type !== "TEST") {
      this.originalTransactionId = draft.originalTransactionId;
      this.transactionId = draft.transactionId;
      this.purchasedAtMs = draft.purchasedAtMs;
      this.expirationAtMs = draft.expirationAtMs;
      this.periodType = draft.periodType;
      this.gracePeriodExpirationAtMs = draft.gracePeriodExpirationAtMs;
      this.renewalIndex = draft.renewalIndex;
      if (type === "CANCELLATION") this.resumeState = from === "trial" ? "trial" : "active";
      this._state = next;
    }
    const event = result.data;
    this.history.push(event);
    return event;
  }

  /* ----------------------------------------------------------- internals */

  private digits(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String(this.deps.rng.int(10));
    return s;
  }

  /** A brand-new order/transaction id in the store's format (see specs/F7-google-play.md). */
  private newTransactionId(): string {
    if (this.cliStore === "play_store") {
      return `GPA.${this.digits(4)}-${this.digits(4)}-${this.digits(4)}-${this.digits(5)}`;
    }
    return String(1 + this.deps.rng.int(9)) + this.digits(15); // App Store-like 16-digit numeric string
  }

  /** Renewal id: Play appends `..N` to the original order id; App Store issues a fresh transaction id. */
  private renewalTransactionId(originalId: string | undefined, index: number): string {
    if (this.cliStore === "play_store" && originalId !== undefined) return `${originalId}..${index}`;
    return this.newTransactionId();
  }

  private draftFor(type: EventType, from: SubscriptionState, now: number): PeriodDraft {
    const d: PeriodDraft = {
      originalTransactionId: this.originalTransactionId,
      transactionId: this.transactionId,
      purchasedAtMs: this.purchasedAtMs,
      expirationAtMs: this.expirationAtMs,
      periodType: this.periodType,
      gracePeriodExpirationAtMs: this.gracePeriodExpirationAtMs,
      renewalIndex: this.renewalIndex,
    };
    switch (type) {
      case "INITIAL_PURCHASE": {
        const startsTrial = from === "none" && this.trial !== undefined;
        d.transactionId = this.newTransactionId();
        // App Store keeps the original transaction id across resubscriptions; Play starts a new order (new purchase token).
        if (this.cliStore === "play_store") d.originalTransactionId = d.transactionId;
        else d.originalTransactionId ??= d.transactionId;
        d.renewalIndex = 0;
        d.purchasedAtMs = now;
        d.expirationAtMs = addDuration(now, startsTrial ? this.trial : this.period);
        d.periodType = startsTrial ? "TRIAL" : "NORMAL";
        d.gracePeriodExpirationAtMs = null;
        break;
      }
      case "RENEWAL": {
        const start = d.expirationAtMs ?? now;
        d.transactionId = this.renewalTransactionId(d.originalTransactionId, d.renewalIndex);
        d.renewalIndex += 1;
        d.purchasedAtMs = start;
        d.expirationAtMs = addDuration(start, this.period);
        d.periodType = "NORMAL";
        d.gracePeriodExpirationAtMs = null;
        break;
      }
      case "BILLING_ISSUE":
        d.gracePeriodExpirationAtMs = addDuration(now, this.grace);
        break;
      case "TEST":
        if (from === "none") {
          d.transactionId = d.originalTransactionId = this.newTransactionId();
          d.purchasedAtMs = now;
          d.expirationAtMs = addDuration(now, this.period);
          d.periodType = "NORMAL";
        }
        break;
      default:
        break;
    }
    return d;
  }

  private buildPayload(type: EventType, from: SubscriptionState, now: number, d: PeriodDraft): Record<string, unknown> {
    const isPurchase = type === "INITIAL_PURCHASE" || type === "RENEWAL" || type === "TEST";
    const price = isPurchase && d.periodType !== "TRIAL" ? this.price : 0;
    const payload: Record<string, unknown> = {
      type,
      id: this.deps.rng.uuid(),
      event_timestamp_ms: now,
      app_id: this.appId,
      app_user_id: this.appUserId,
      original_app_user_id: this.appUserId,
      aliases: [this.appUserId],
      subscriber_attributes: {},
      product_id: this.productId,
      period_type: d.periodType,
      purchased_at_ms: d.purchasedAtMs,
      expiration_at_ms: d.expirationAtMs,
      environment: this.environment,
      entitlement_id: null,
      entitlement_ids: [...this.entitlementIds],
      presented_offering_id: null,
      transaction_id: d.transactionId,
      original_transaction_id: d.originalTransactionId,
      is_family_share: false,
      country_code: this.countryCode,
      store: this.store,
      currency: this.currency,
      price,
      price_in_purchased_currency: price,
      tax_percentage: 0,
      commission_percentage: 0.3,
      takehome_percentage: 0.7,
      offer_code: null,
    };
    switch (type) {
      case "RENEWAL":
        payload["is_trial_conversion"] = from === "trial";
        break;
      case "CANCELLATION":
        payload["cancel_reason"] = from === "billing_issue" ? "BILLING_ERROR" : "UNSUBSCRIBE";
        break;
      case "BILLING_ISSUE":
        payload["grace_period_expiration_at_ms"] = d.gracePeriodExpirationAtMs;
        break;
      case "EXPIRATION":
        payload["expiration_reason"] = from === "billing_issue" ? "BILLING_ERROR" : "UNSUBSCRIBE";
        break;
      default:
        break;
    }
    return payload;
  }
}

interface PeriodDraft {
  originalTransactionId: string | undefined;
  transactionId: string | undefined;
  purchasedAtMs: number | undefined;
  expirationAtMs: number | undefined;
  periodType: PeriodType;
  gracePeriodExpirationAtMs: number | null;
  renewalIndex: number;
}
