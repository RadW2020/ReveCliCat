import type { Command } from "commander";
import { RccError } from "../core/errors.js";
import { runScenario } from "../core/engine.js";
import { assertUrl } from "../core/http.js";
import { println, type Io } from "../core/io.js";
import { renderFailedExpectations, renderRunSummary, renderRunTable } from "../core/output.js";
import { loadScenarioWithSource } from "../core/scenario.js";
import { bold, dim } from "../core/colors.js";
import { parseSeed } from "./send.js";
import { CONFIG_FILE, DEFAULT_TARGET, loadConfig, resolveDefaults } from "../core/config.js";

export interface RunCommandOptions {
  to?: string | undefined;
  authHeader?: string | undefined;
  speed: string;
  seed?: string;
  dryRun: boolean;
  json: boolean;
}

export function parseSpeed(input: string): "instant" | number {
  if (input === "instant") return "instant";
  const n = Number(input);
  if (Number.isInteger(n) && n >= 0) return n;
  throw new RccError(`Invalid --speed "${input}": use \`instant\` or a number of milliseconds between events (e.g. --speed 500).`);
}

export function registerRun(program: Command, io: Io): void {
  program
    .command("run")
    .argument("<scenario.yaml>", "scenario file to execute")
    .description("Run a scenario: advance a virtual clock, emit a coherent event sequence and deliver it over HTTP.")
    .option("--to <url>", `target URL (default: ${DEFAULT_TARGET}, or "to" in ${CONFIG_FILE})`)
    .option("--auth-header <value>", `value sent as the Authorization header (default: "authHeader" in ${CONFIG_FILE})`)
    .option("--speed <instant|ms>", "wall-clock pause between events", "instant")
    .option("--seed <seed>", "deterministic ids and timestamps")
    .option("--dry-run", "print each envelope as JSON (one per line) instead of sending", false)
    .option("--json", "print the full run result as one JSON document on stdout (human output goes to stderr)", false)
    .addHelpText("after", `
Examples:
  $ rcc run scenarios/trial-churns.yaml
  $ rcc run scenarios/happy-year.yaml --to http://localhost:8787/webhook --speed 250
  $ rcc run scenarios/billing-issue-recovers.yaml --dry-run --seed 42 | jq .event.type
  $ rcc run scenarios/happy-year.yaml --json > result.json   # CI: exit 1 on any failed expectation`)
    .action(async (file: string, opts: RunCommandOptions) => {
      const d = resolveDefaults(opts, loadConfig());
      const to = assertUrl(d.to, "--to");
      const speed = parseSpeed(opts.speed);
      const loaded = loadScenarioWithSource(file);
      const human = opts.dryRun || opts.json ? io.stderr : io.stdout;
      const desc = loaded.scenario.description ? ` — ${loaded.scenario.description}` : "";
      println(human, `▶ ${bold(loaded.scenario.name)}${dim(desc)}`);

      const result = await runScenario(loaded.scenario, {
        to,
        authHeader: d.authHeader,
        speed,
        seed: parseSeed(opts.seed),
        dryRun: opts.dryRun,
        source: loaded,
        onEvent: (_r, envelope) => {
          if (opts.dryRun && !opts.json) println(io.stdout, JSON.stringify(envelope));
        },
      });

      println(human, renderRunTable(result));
      for (const line of renderFailedExpectations(result)) println(human, line);
      println(human, renderRunSummary(result));
      if (opts.json) println(io.stdout, JSON.stringify(result, null, 2));
      if (!result.ok) {
        const failedExp = result.expectations.filter((e) => !e.ok).length;
        throw new RccError(
          failedExp > 0
            ? `Scenario finished with ${failedExp} failed expectation${failedExp === 1 ? "" : "s"}.`
            : "Scenario finished with failed deliveries.",
          { hint: "Every event must be answered with a 2xx status and every expect: block must hold. Check your handler logs, or run with --dry-run to inspect payloads." },
        );
      }
    });
}
