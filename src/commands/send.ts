import type { Command } from "commander";
import { RccError } from "../core/errors.js";
import { CONFIG_FILE, DEFAULT_TARGET, loadConfig, resolveDefaults } from "../core/config.js";
import { applyStep, createSimulation, preludeFor, spanOf } from "../core/engine.js";
import { assertUrl, postEvent } from "../core/http.js";
import { println, type Io } from "../core/io.js";
import { green, red, dim } from "../core/colors.js";
import { CLI_STORES, ENVIRONMENTS, EVENT_TYPES, type CliStore, type Environment, type EventType } from "../schemas/common.js";
import type { WebhookEnvelope } from "../schemas/index.js";

export { DEFAULT_TARGET };

export interface SendOptions {
  to?: string | undefined;
  store?: string | undefined;
  user?: string;
  product: string;
  authHeader?: string | undefined;
  environment?: string | undefined;
  set?: string[] | undefined;
  seed?: string;
  dryRun?: boolean | undefined;
}

/** Parse repeatable `--set key=value`. Values are JSON when they parse, otherwise strings. */
export function parseSetFlag(pairs: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new RccError(`Invalid --set "${pair}": expected key=value.`, {
        hint: "Example: --set price=4.99 --set subscriber_attributes.plan.value=pro",
      });
    }
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      /* plain string */
    }
    out[key] = value;
  }
  return out;
}

export function parseEventType(input: string): EventType {
  const upper = input.toUpperCase();
  if ((EVENT_TYPES as readonly string[]).includes(upper)) return upper as EventType;
  throw new RccError(`Unknown event type "${input}". Valid types: ${EVENT_TYPES.join(", ")}.`, {
    hint: "Example: rcc send INITIAL_PURCHASE",
  });
}

export function parseEnvironment(input: string): Environment {
  if ((ENVIRONMENTS as readonly string[]).includes(input)) return input as Environment;
  throw new RccError(`Invalid --environment "${input}". Use one of: ${ENVIRONMENTS.join(", ")}.`);
}

export function parseStore(input: string): CliStore {
  if ((CLI_STORES as readonly string[]).includes(input)) return input as CliStore;
  throw new RccError(`Unsupported --store "${input}". v0.1 supports: ${CLI_STORES.join(", ")}.`, {
    hint: "Other stores are on the roadmap (see docs/BACKLOG.md → Icebox).",
  });
}

export function parseSeed(input: string | undefined): number | string | undefined {
  if (input === undefined) return undefined;
  return /^\d+$/.test(input) ? Number(input) : input;
}

/** Build the single event (after its prelude) as an envelope. Exported for tests and `run`. */
export function buildSingleEvent(type: EventType, opts: SendOptions): WebhookEnvelope {
  const seed = parseSeed(opts.seed);
  const prelude = preludeFor(type);
  const subscriberOpts = {
    appUserId: opts.user ?? "auto",
    productId: opts.product,
    period: "P1M",
    store: parseStore(opts.store ?? "app_store"),
    environment: parseEnvironment(opts.environment ?? "SANDBOX"),
  };
  // Unseeded: start in the past so the final event lands at ≈ now.
  const startAt = seed === undefined ? Date.now() - spanOf(prelude, Date.now()) : undefined;
  const sim = createSimulation(subscriberOpts, seed, startAt);
  for (const step of prelude) applyStep(sim, step);
  const event = sim.subscriber.emit(type, parseSetFlag(opts.set ?? []));
  return { api_version: "1.0", event };
}

export function registerSend(program: Command, io: Io): void {
  program
    .command("send")
    .argument("<EVENT_TYPE>", `event to send: ${EVENT_TYPES.join(" | ")}`)
    .description("Send a single, schema-valid RevenueCat webhook event to your endpoint.")
    .option("--to <url>", `target URL (default: ${DEFAULT_TARGET}, or "to" in ${CONFIG_FILE})`)
    .option("--store <store>", `store: ${CLI_STORES.join(" | ")} (default: app_store, or "store" in ${CONFIG_FILE})`)
    .option("--user <app_user_id>", "app_user_id (default: generated $RCAnonymousID)")
    .option("--product <product_id>", "product_id", "com.example.premium.monthly")
    .option("--auth-header <value>", `value sent as the Authorization header (default: "authHeader" in ${CONFIG_FILE})`)
    .option("--environment <env>", `${ENVIRONMENTS.join(" | ")} (default: SANDBOX, or "environment" in ${CONFIG_FILE})`)
    .option("--set <key=value>", "override a payload field (repeatable, dot paths allowed)", (v: string, acc: string[] | undefined) => [...(acc ?? []), v])
    .option("--seed <seed>", "deterministic ids and timestamps")
    .option("--dry-run", "print the payload instead of sending it")
    .addHelpText("after", `
Examples:
  $ rcc send INITIAL_PURCHASE
  $ rcc send RENEWAL --to http://localhost:8787/webhook --auth-header "Bearer dev"
  $ rcc send CANCELLATION --set cancel_reason=BILLING_ERROR --dry-run | jq .event.type`)
    .action(async (eventType: string, opts: SendOptions) => {
      const type = parseEventType(eventType);
      const d = resolveDefaults(opts, loadConfig());
      const to = assertUrl(d.to, "--to");
      const envelope = buildSingleEvent(type, { ...opts, to, store: d.store, environment: d.environment, authHeader: d.authHeader });
      if (opts.dryRun) {
        println(io.stdout, JSON.stringify(envelope, null, 2));
        return;
      }
      const res = await postEvent(to, envelope, { authHeader: d.authHeader });
      const ok = res.status >= 200 && res.status < 300;
      const mark = ok ? green("✔") : red("✖");
      println(io.stdout, `${mark} ${type.padEnd(16)} → ${to}  ${res.status}  ${dim(`(${res.latencyMs} ms)`)}`);
      if (!ok) {
        throw new RccError(`Endpoint answered ${res.status} for ${type}.`, {
          hint: "RevenueCat treats anything other than 200 as a failure and retries. Check your handler logs.",
        });
      }
    });
}
