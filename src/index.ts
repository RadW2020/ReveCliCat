/**
 * ReveCliCat public API (programmatic use).
 * Unofficial project — not affiliated with RevenueCat, Inc.
 */
export { buildProgram } from "./program.js";
export { RccError } from "./core/errors.js";
export * from "./schemas/index.js";
export { VirtualClock, parseDuration, addDuration, formatDuration, type Duration } from "./core/clock.js";
export { createRng, type Rng } from "./core/rng.js";
export {
  loadScenario,
  loadScenarioWithSource,
  parseScenario,
  ScenarioSchema,
  ScenarioValidationError,
  type LoadedScenario,
  type Scenario,
  type Step,
} from "./core/scenario.js";
export { Subscriber, PrematureEventError, type SubscriberOptions } from "./core/subscriber.js";
export { transition, legalEvents, IllegalTransitionError, type SubscriptionState } from "./core/state-machine.js";
export { runScenario, createSimulation, type RunResult, type RunOptions, type EventResult } from "./core/engine.js";
export { postEvent } from "./core/http.js";
