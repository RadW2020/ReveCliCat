import { VirtualClock, addDuration, parseDuration } from "./clock.js";
import { RccError } from "./errors.js";
import { postEvent } from "./http.js";
import { createRng } from "./rng.js";
import type { LoadedScenario, Scenario, Step } from "./scenario.js";
import { Subscriber, type SubscriberOptions } from "./subscriber.js";
import type { Event, EventType, WebhookEnvelope } from "../schemas/index.js";

export interface Simulation {
  clock: VirtualClock;
  subscriber: Subscriber;
}

/** Create a clock + subscriber pair. Seeded → fixed epoch; unseeded → `startAt` (default now). */
export function createSimulation(opts: SubscriberOptions, seed: number | string | undefined, startAt?: number): Simulation {
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

/* ------------------------------------------------------------------ runScenario */

export interface EventResult {
  /** 0-based index of the step in `scenario.steps`. */
  step: number;
  type: EventType;
  virtualTime: string;
  status: number | null;
  latencyMs: number | null;
  event: Event;
}

export interface ExpectationResult {
  scope: "step" | "scenario";
  step: number | null;
  rule: string;
  expected: string;
  actual: string;
  ok: boolean;
}

export interface RunResult {
  scenario: string;
  seed: number | string | null;
  startedAt: string;
  endedAt: string;
  virtualSpanMs: number;
  events: EventResult[];
  expectations: ExpectationResult[];
  ok: boolean;
}

export interface RunOptions {
  to: string;
  authHeader?: string | undefined;
  speed: "instant" | number;
  seed?: number | string | undefined;
  dryRun?: boolean | undefined;
  source?: Pick<LoadedScenario, "file" | "stepPositions"> | undefined;
  onEvent?: ((result: EventResult, envelope: WebhookEnvelope) => void) | undefined;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function subscriberOptions(scenario: Scenario): SubscriberOptions {
  const s = scenario.subscriber;
  return {
    appUserId: s.app_user_id,
    productId: s.product_id,
    period: s.period,
    trial: s.trial,
    gracePeriod: s.grace_period,
    store: s.store,
    environment: s.environment,
  };
}

function stepLabel(index: number, source: RunOptions["source"]): string {
  const pos = source?.stepPositions[index];
  return pos ? `step ${index + 1} (${source.file}:${pos.line})` : `step ${index + 1}`;
}

/** Execute a scenario: advance the virtual clock, emit coherent events, deliver them, collect results. */
export async function runScenario(scenario: Scenario, opts: RunOptions): Promise<RunResult> {
  const sim = createSimulation(subscriberOptions(scenario), opts.seed);
  const startedMs = sim.clock.now();
  const events: EventResult[] = [];
  let delivered = 0;

  for (const [index, step] of scenario.steps.entries()) {
    if (step.advance !== undefined) {
      sim.clock.advance(step.advance);
      continue;
    }
    if (delivered > 0 && opts.speed !== "instant") await sleep(opts.speed);

    let event: Event;
    try {
      event = sim.subscriber.emit(step.event!, step.set ?? {});
    } catch (err) {
      if (err instanceof RccError) {
        throw new RccError(`${stepLabel(index, opts.source)}: ${err.message}`, {
          ...(err.hint === undefined ? {} : { hint: err.hint }),
          exitCode: err.exitCode,
          cause: err,
        });
      }
      throw err;
    }
    const envelope: WebhookEnvelope = { api_version: "1.0", event };
    let status: number | null = null;
    let latencyMs: number | null = null;
    if (!opts.dryRun) {
      const res = await postEvent(opts.to, envelope, { authHeader: opts.authHeader });
      status = res.status;
      latencyMs = res.latencyMs;
    }
    delivered++;
    const result: EventResult = { step: index, type: event.type, virtualTime: new Date(sim.clock.now()).toISOString(), status, latencyMs, event };
    events.push(result);
    opts.onEvent?.(result, envelope);
  }

  const endedMs = sim.clock.now();
  const ok = events.every((e) => e.status === null || (e.status >= 200 && e.status < 300));
  return {
    scenario: scenario.name,
    seed: opts.seed ?? null,
    startedAt: new Date(startedMs).toISOString(),
    endedAt: new Date(endedMs).toISOString(),
    virtualSpanMs: endedMs - startedMs,
    events,
    expectations: [],
    ok,
  };
}
