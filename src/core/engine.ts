import { VirtualClock, addDuration, parseDuration } from "./clock.js";
import { createRng } from "./rng.js";
import { Subscriber, type SubscriberOptions } from "./subscriber.js";
import type { Step } from "./scenario.js";
import type { Event, EventType } from "../schemas/index.js";

export interface Simulation {
  clock: VirtualClock;
  subscriber: Subscriber;
}

/** Create a clock + subscriber pair. Seeded → fixed epoch; unseeded → `startAt` (default now). */
export function createSimulation(
  opts: SubscriberOptions,
  seed: number | string | undefined,
  startAt?: number,
): Simulation {
  const clock = VirtualClock.forSeed(seed, startAt);
  const subscriber = new Subscriber(opts, { clock, rng: createRng(seed) });
  return { clock, subscriber };
}

/** Apply one step to a simulation. Returns the emitted event for `event` steps. */
export function applyStep(sim: Simulation, step: Step): Event | undefined {
  if (step.advance !== undefined) {
    sim.clock.advance(step.advance);
    return undefined;
  }
  return sim.subscriber.emit(step.event!, step.set ?? {});
}

/** Total virtual time a list of steps advances, starting from `fromMs` (calendar-aware). */
export function spanOf(steps: readonly Step[], fromMs: number): number {
  let t = fromMs;
  for (const s of steps) if (s.advance !== undefined) t = addDuration(t, parseDuration(s.advance));
  return t - fromMs;
}

/** Shortest legal history before a single event (see specs/F2-commands.md). */
export function preludeFor(type: EventType): Step[] {
  const ip: Step = { event: "INITIAL_PURCHASE" };
  switch (type) {
    case "TEST":
    case "INITIAL_PURCHASE":
      return [];
    case "RENEWAL":
    case "BILLING_ISSUE":
      return [ip, { advance: "P1M" }];
    case "CANCELLATION":
      return [ip, { advance: "P10D" }];
    case "UNCANCELLATION":
      return [ip, { advance: "P10D" }, { event: "CANCELLATION" }, { advance: "P1D" }];
    case "EXPIRATION":
      return [ip, { advance: "P10D" }, { event: "CANCELLATION" }, { advance: "P21D" }];
  }
}
