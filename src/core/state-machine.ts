import { RccError } from "./errors.js";
import { STORE_LABEL, UNSUPPORTED_EVENTS_BY_STORE, type CliStore, type EventType } from "../schemas/common.js";

export const STATES = [
  "none",
  "trial",
  "active",
  "cancelled_pending_expiration",
  "billing_issue",
  "expired",
] as const;
export type SubscriptionState = (typeof STATES)[number];

/** Extra facts the pure transition needs. */
export interface TransitionContext {
  /** Does the product start with a free trial? (INITIAL_PURCHASE from `none`) */
  hasTrial: boolean;
  /** State to return to on UNCANCELLATION (the state before the CANCELLATION). */
  resumeState: "trial" | "active";
  /** Store being simulated; some stores never emit some events. */
  store?: CliStore | undefined;
}

export class IllegalTransitionError extends RccError {
  readonly state: SubscriptionState;
  readonly event: EventType;
  readonly legal: readonly EventType[];
  constructor(state: SubscriptionState, event: EventType, store?: CliStore) {
    const legal = legalEvents(state, store);
    const unsupported = store !== undefined && (UNSUPPORTED_EVENTS_BY_STORE[store] ?? []).includes(event);
    super(
      unsupported
        ? `${STORE_LABEL[store]} does not emit ${event} (RevenueCat store compatibility table). Legal events from "${state}" for ${STORE_LABEL[store]}: ${legal.join(", ")}.`
        : `Illegal transition: cannot apply ${event} while the subscription is "${state}". Legal events from "${state}": ${legal.join(", ")}.`,
      { hint: "Check the order of the steps in your scenario (e.g. a RENEWAL needs an INITIAL_PURCHASE first)." },
    );
    this.name = "IllegalTransitionError";
    this.state = state;
    this.event = event;
    this.legal = legal;
  }
}

type Rule = (ctx: TransitionContext) => SubscriptionState;

/** Transition table. Order of keys = order reported to the user. TEST is added to every state. */
const TABLE: Record<SubscriptionState, Partial<Record<EventType, Rule>>> = {
  none: { INITIAL_PURCHASE: (ctx) => (ctx.hasTrial ? "trial" : "active") },
  trial: {
    RENEWAL: () => "active",
    CANCELLATION: () => "cancelled_pending_expiration",
    BILLING_ISSUE: () => "billing_issue",
    EXPIRATION: () => "expired",
  },
  active: {
    RENEWAL: () => "active",
    CANCELLATION: () => "cancelled_pending_expiration",
    BILLING_ISSUE: () => "billing_issue",
    EXPIRATION: () => "expired",
  },
  cancelled_pending_expiration: {
    UNCANCELLATION: (ctx) => ctx.resumeState,
    // Real flows: recovery after a BILLING_ERROR cancellation (Stripe capture 2026-08-29); App Store "CANCELLATION
    // followed by a RENEWAL" when cancelling <24 h before a trial ends (docs S4).
    RENEWAL: () => "active",
    EXPIRATION: () => "expired",
  },
  billing_issue: {
    RENEWAL: () => "active",
    EXPIRATION: () => "expired",
    CANCELLATION: () => "cancelled_pending_expiration",
  },
  expired: { INITIAL_PURCHASE: () => "active" },
};

/** Events that may legally follow `state`, in display order; `store` removes events that store never emits. */
export function legalEvents(state: SubscriptionState, store?: CliStore): EventType[] {
  const excluded = store === undefined ? [] : (UNSUPPORTED_EVENTS_BY_STORE[store] ?? []);
  return [...(Object.keys(TABLE[state]) as EventType[]), "TEST" as EventType].filter((e) => !excluded.includes(e));
}

/** Pure transition. Throws IllegalTransitionError; never returns an incoherent state. */
export function transition(state: SubscriptionState, event: EventType, ctx: TransitionContext): SubscriptionState {
  if (ctx.store !== undefined && (UNSUPPORTED_EVENTS_BY_STORE[ctx.store] ?? []).includes(event)) {
    throw new IllegalTransitionError(state, event, ctx.store);
  }
  if (event === "TEST") return state;
  const rule = TABLE[state][event];
  if (!rule) throw new IllegalTransitionError(state, event, ctx.store);
  return rule(ctx);
}
