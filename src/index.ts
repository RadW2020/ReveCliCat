/**
 * ReveCliCat public API (programmatic use).
 * Unofficial project — not affiliated with RevenueCat, Inc.
 */
export { buildProgram } from "./program.js";
export { RccError } from "./core/errors.js";
export * from "./schemas/index.js";
export { VirtualClock, parseDuration, addDuration, formatDuration, type Duration } from "./core/clock.js";
export { createRng, type Rng } from "./core/rng.js";
export { loadScenario, parseScenario, ScenarioSchema, ScenarioValidationError, type Scenario, type Step } from "./core/scenario.js";
