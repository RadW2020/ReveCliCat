import { describe, expect, it } from "vitest";
import {
  IllegalTransitionError,
  STATES,
  legalEvents,
  transition,
  type SubscriptionState,
  type TransitionContext,
} from "../../src/core/state-machine.js";
import type { EventType } from "../../src/schemas/common.js";

const ctx: TransitionContext = { hasTrial: true, resumeState: "active" };

describe("T-010 legal transitions", () => {
  const cases: Array<[SubscriptionState, EventType, SubscriptionState, Partial<typeof ctx>?]> = [
    ["none", "INITIAL_PURCHASE", "trial", { hasTrial: true }],
    ["none", "INITIAL_PURCHASE", "active", { hasTrial: false }],
    ["trial", "RENEWAL", "active"],
    ["trial", "CANCELLATION", "cancelled_pending_expiration"],
    ["trial", "BILLING_ISSUE", "billing_issue"],
    ["trial", "EXPIRATION", "expired"],
    ["active", "RENEWAL", "active"],
    ["active", "CANCELLATION", "cancelled_pending_expiration"],
    ["active", "BILLING_ISSUE", "billing_issue"],
    ["active", "EXPIRATION", "expired"],
    ["cancelled_pending_expiration", "UNCANCELLATION", "active", { resumeState: "active" }],
    ["cancelled_pending_expiration", "UNCANCELLATION", "trial", { resumeState: "trial" }],
    ["cancelled_pending_expiration", "EXPIRATION", "expired"],
    ["billing_issue", "RENEWAL", "active"],
    ["billing_issue", "EXPIRATION", "expired"],
    ["billing_issue", "CANCELLATION", "cancelled_pending_expiration"],
    ["expired", "INITIAL_PURCHASE", "active", { hasTrial: true }],
  ];
  it.each(cases)("%s --%s--> %s", (from, event, to, over) => {
    expect(transition(from, event, { ...ctx, ...over })).toBe(to);
  });

  it("TEST is legal from every state and leaves it unchanged", () => {
    for (const s of STATES) expect(transition(s, "TEST", ctx)).toBe(s);
  });
});

describe("T-010 illegal transitions", () => {
  const illegal: Array<[SubscriptionState, EventType]> = [
    ["none", "RENEWAL"],
    ["none", "CANCELLATION"],
    ["none", "EXPIRATION"],
    ["active", "UNCANCELLATION"],
    ["active", "INITIAL_PURCHASE"],
    ["trial", "INITIAL_PURCHASE"],
    ["expired", "RENEWAL"],
    ["expired", "EXPIRATION"],
    ["cancelled_pending_expiration", "RENEWAL"],
    ["cancelled_pending_expiration", "CANCELLATION"],
    ["billing_issue", "BILLING_ISSUE"],
    ["billing_issue", "UNCANCELLATION"],
  ];
  it.each(illegal)("%s --%s--> throws", (from, event) => {
    expect(() => transition(from, event, ctx)).toThrow(IllegalTransitionError);
  });

  it("the error names state, event and legal events", () => {
    try {
      transition("expired", "RENEWAL", ctx);
    } catch (err) {
      const e = err as IllegalTransitionError;
      expect(e.message).toContain("expired");
      expect(e.message).toContain("RENEWAL");
      expect(e.message).toContain("INITIAL_PURCHASE");
      expect(e.state).toBe("expired");
      expect(e.event).toBe("RENEWAL");
      expect(e.legal).toEqual(["INITIAL_PURCHASE", "TEST"]);
      return;
    }
    throw new Error("expected throw");
  });
});

describe("T-010 legalEvents", () => {
  it("matches the transition table", () => {
    expect(legalEvents("none")).toEqual(["INITIAL_PURCHASE", "TEST"]);
    expect(legalEvents("trial")).toEqual(["RENEWAL", "CANCELLATION", "BILLING_ISSUE", "EXPIRATION", "TEST"]);
    expect(legalEvents("active")).toEqual(["RENEWAL", "CANCELLATION", "BILLING_ISSUE", "EXPIRATION", "TEST"]);
    expect(legalEvents("cancelled_pending_expiration")).toEqual(["UNCANCELLATION", "EXPIRATION", "TEST"]);
    expect(legalEvents("billing_issue")).toEqual(["RENEWAL", "EXPIRATION", "CANCELLATION", "TEST"]);
    expect(legalEvents("expired")).toEqual(["INITIAL_PURCHASE", "TEST"]);
  });
  it("legalEvents and transition agree for every (state, event) pair", () => {
    const all: EventType[] = ["TEST", "INITIAL_PURCHASE", "RENEWAL", "CANCELLATION", "UNCANCELLATION", "BILLING_ISSUE", "EXPIRATION"];
    for (const s of STATES) {
      for (const e of all) {
        const legal = legalEvents(s).includes(e);
        let threw = false;
        try {
          transition(s, e, ctx);
        } catch {
          threw = true;
        }
        expect(threw, `${s} --${e}`).toBe(!legal);
      }
    }
  });
});
