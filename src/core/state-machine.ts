import { RccError } from "./errors.js";
import type { EventType } from "../schemas/common.js";

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
}

export class IllegalTransitionError extends RccError {
  readonly state: SubscriptionState;
  readonly event: EventType;
  readonly legal: readonly EventType[];
  constructor(state: SubscriptionState, event: EventType) {
    const legal = legalEvents(state);
    super(
      `Illegal transition: cannot apply ${event} while the subscription is "${state}". ` +
        `Legal events from "${state}": ${legal.join(", ")}.`,
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
    EXPIRATION: () => "expired",
  },
  billing_issue: {
    RENEWAL: () => "active",
    EXPIRATION: () => "expired",
    CANCELLATION: () => "cancelled_pending_expiration",
  },
  expired: { INITIAL_PURCHASE: () => "active" },
};

/** Events that may legally follow `state`, in display order. */
export function legalEvents(state: SubscriptionState): EventType[] {
  return [...(Object.keys(TABLE[state]) as EventType[]), "TEST"];
}

/** Pure transition. Throws IllegalTransitionError; never returns an incoherent state. */
export function transition(state: SubscriptionState, event: EventType, ctx: TransitionContext): SubscriptionState {
  if (event === "TEST") return state;
  const rule = TABLE[state][event];
  if (!rule) throw new IllegalTransitionError(state, event);
  return rule(ctx);
}
