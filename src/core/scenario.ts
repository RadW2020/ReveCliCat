import { readFileSync } from "node:fs";
import { LineCounter, isMap, isNode, parseDocument, type Document, type Node } from "yaml";
import { z } from "zod";
import { parseDuration } from "./clock.js";
import { RccError } from "./errors.js";
import { CLI_STORES, ENVIRONMENTS, EVENT_TYPES } from "../schemas/common.js";

/* ------------------------------------------------------------------ schema */

const duration = z.string().superRefine((val, ctx) => {
  try {
    parseDuration(val);
  } catch {
    ctx.addIssue({ code: "custom", message: `Invalid ISO-8601 duration: "${val}". Examples: P1M, P1W, P3D, PT12H.` });
  }
});

const list = (values: readonly string[]): string => values.join(", ");

const eventType = z.enum(EVENT_TYPES, {
  error: (iss) => `Unknown event type "${String(iss.input)}". Valid types: ${list(EVENT_TYPES)}.`,
});

const httpStatus = z.int({ error: "response_status must be an integer HTTP status (e.g. 200)." }).min(100).max(599);

export const SubscriberConfigSchema = z.strictObject({
  app_user_id: z.string().min(1).default("auto"),
  product_id: z.string().min(1).default("com.example.premium.monthly"),
  period: duration.default("P1M"),
  trial: duration.optional(),
  grace_period: duration.default("P16D"),
  store: z.enum(CLI_STORES, {
    error: (iss) => `Unsupported store "${String(iss.input)}". v0.1 supports: ${list(CLI_STORES)}.`,
  }).default("app_store"),
  environment: z.enum(ENVIRONMENTS, {
    error: (iss) => `Invalid environment "${String(iss.input)}". Use one of: ${list(ENVIRONMENTS)}.`,
  }).default("SANDBOX"),
});

const StepExpectSchema = z.strictObject({ response_status: httpStatus });

/** Overrides applied to a payload; keys may be dot paths (`subscriber_attributes.plan.value`). */
const SetSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const RawStepSchema = z.strictObject({
  event: eventType.optional(),
  advance: duration.optional(),
  set: SetSchema.optional(),
  expect: StepExpectSchema.optional(),
});

const StepSchema = RawStepSchema.superRefine((step, ctx) => {
  const hasEvent = step.event !== undefined;
  const hasAdvance = step.advance !== undefined;
  if (hasEvent === hasAdvance) {
    ctx.addIssue({
      code: "custom",
      message: "A step must have exactly one of `event: <TYPE>` or `advance: <duration>`.",
    });
    return;
  }
  if (hasAdvance && (step.set !== undefined || step.expect !== undefined)) {
    ctx.addIssue({ code: "custom", message: "`set` and `expect` are only allowed on `event` steps." });
  }
});

export const ScenarioExpectSchema = z.strictObject({
  all_responses_status: httpStatus.optional(),
  max_response_ms: z.int().positive({ error: "max_response_ms must be a positive integer (milliseconds)." }).optional(),
});

export const ScenarioSchema = z.strictObject({
  name: z
    .string({ error: "`name` is required." })
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "name may only contain letters, digits, '.', '_' and '-'."),
  description: z.string().optional(),
  subscriber: SubscriberConfigSchema.default({
    app_user_id: "auto",
    product_id: "com.example.premium.monthly",
    period: "P1M",
    grace_period: "P16D",
    store: "app_store",
    environment: "SANDBOX",
  }),
  steps: z.array(StepSchema).min(1, "`steps` must contain at least one step."),
  expect: ScenarioExpectSchema.optional(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type SubscriberConfig = z.infer<typeof SubscriberConfigSchema>;
export type Step = z.infer<typeof StepSchema>;
export type EventStep = Step & { event: NonNullable<Step["event"]> };
export type AdvanceStep = Step & { advance: string };

export function isEventStep(step: Step): step is EventStep {
  return step.event !== undefined;
}

/* ------------------------------------------------------------------ errors */

export class ScenarioValidationError extends RccError {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly path: string;
  constructor(opts: { file: string; line: number; column: number; path: string; detail: string; hint?: string }) {
    const where = opts.path === "" ? "" : `${opts.path}: `;
    super(`${opts.file}:${opts.line}:${opts.column} — ${where}${opts.detail}`, {
      hint: opts.hint ?? "See the scenario format in the README or run `rcc init` for working examples.",
    });
    this.name = "ScenarioValidationError";
    this.file = opts.file;
    this.line = opts.line;
    this.column = opts.column;
    this.path = opts.path;
  }
}

function dotted(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, seg) => {
    if (typeof seg === "number") return `${acc}[${seg}]`;
    return acc === "" ? String(seg) : `${acc}.${String(seg)}`;
  }, "");
}

interface Pos {
  line: number;
  column: number;
}

/** Find the best YAML node for a zod path (walking up when the node is missing) and return its 1-based position. */
function locate(doc: Document, counter: LineCounter, path: readonly PropertyKey[], keyName?: string): Pos {
  const segs = path.filter((s): s is string | number => typeof s !== "symbol");
  for (let depth = segs.length; depth >= 0; depth--) {
    const sub = segs.slice(0, depth);
    const node: unknown = sub.length === 0 ? doc.contents : doc.getIn(sub, true);
    if (!isNode(node)) continue;
    if (keyName !== undefined && depth === segs.length && isMap(node)) {
      const pair = node.items.find((p) => isNode(p.key) && String(p.key.toJSON()) === keyName);
      const keyNode = pair?.key;
      if (isNode(keyNode) && keyNode.range) return toPos(counter, keyNode.range[0]);
    }
    if ((node as Node).range) return toPos(counter, (node as Node).range![0]);
  }
  return { line: 1, column: 1 };
}

function toPos(counter: LineCounter, offset: number): Pos {
  const { line, col } = counter.linePos(offset);
  return { line, column: col };
}

/* ------------------------------------------------------------------ loading */

/** Parse scenario YAML text. `file` is used only for error messages. */
export function parseScenario(text: string, file = "<inline>"): Scenario {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, keepSourceTokens: true });

  const syntax = doc.errors[0];
  if (syntax) {
    const pos = syntax.linePos?.[0];
    throw new ScenarioValidationError({
      file,
      line: pos?.line ?? 1,
      column: pos?.col ?? 1,
      path: "",
      detail: `YAML syntax error: ${syntax.message.split("\n")[0] ?? syntax.code}`,
    });
  }

  const result = ScenarioSchema.safeParse(doc.toJS() ?? {});
  if (result.success) return result.data;

  // Report the first (most specific) issue. Custom "exactly one of" issues are the most useful for steps.
  const issue = result.error.issues[0]!;
  const keyName = issue.code === "unrecognized_keys" ? issue.keys[0] : undefined;
  const pos = locate(doc, counter, issue.path, keyName);
  const detail =
    issue.code === "unrecognized_keys"
      ? `Unknown key${issue.keys.length > 1 ? "s" : ""} ${issue.keys.map((k) => `"${k}"`).join(", ")}.`
      : issue.code === "invalid_type" && issue.input === undefined
        ? `Missing required field \`${String(issue.path.at(-1) ?? "")}\`.`
        : issue.message;
  throw new ScenarioValidationError({ file, line: pos.line, column: pos.column, path: dotted(issue.path), detail });
}

/** Read and validate a scenario file from disk. */
export function loadScenario(file: string): Scenario {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (cause) {
    throw new RccError(`Scenario file not found: ${file}`, {
      hint: "Check the path, or run `rcc init` to create a scenarios/ folder with examples.",
      cause,
    });
  }
  return parseScenario(text, file);
}
