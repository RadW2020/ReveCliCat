import { bold, dim, green, red } from "./colors.js";
import type { EventResult, RunResult } from "./engine.js";
import type { Scenario } from "./scenario.js";

/** Render rows as a padded text table. Colour helpers must not affect widths, so cells are coloured after padding. */
export function table(headers: string[], rows: string[][], colour?: (cell: string, col: number, row: number) => string): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const pad = (cells: string[], row: number): string =>
    cells
      .map((c, i) => {
        const padded = i === 0 ? c.padStart(widths[i]!) : c.padEnd(widths[i]!);
        return colour && row >= 0 ? colour(padded, i, row) : padded;
      })
      .join("  ")
      .trimEnd();
  return [dim(pad(headers, -1)), ...rows.map((r, i) => pad(r, i))].join("\n");
}

export function humanDays(ms: number): string {
  return `${Math.round(ms / 86_400_000)}d`;
}

const RUN_HEADERS = ["#", "event", "virtual time", "status", "latency"] as const;

/**
 * Table renderer whose column widths are known up front (from the scenario), so rows can be
 * printed one by one as events are delivered and still line up with the header.
 */
export interface LiveTable {
  header(): string;
  row(e: EventResult, index: number): string;
}

export function createRunTable(scenario: Pick<Scenario, "steps">): LiveTable {
  const eventCount = scenario.steps.filter((s) => s.event !== undefined).length;
  const eventTypes = scenario.steps.map((s) => s.event ?? "");
  const widths = [
    Math.max(RUN_HEADERS[0].length, String(eventCount).length),
    Math.max(RUN_HEADERS[1].length, ...eventTypes.map((t) => t.length)),
    Math.max(RUN_HEADERS[2].length, "2025-01-01T00:00:00.000Z".length),
    RUN_HEADERS[3].length,
    Math.max(RUN_HEADERS[4].length, "99999 ms".length),
  ];
  const pad = (cells: readonly string[], colour?: (cell: string, col: number) => string): string =>
    cells
      .map((c, i) => {
        const padded = i === 0 ? c.padStart(widths[i]!) : c.padEnd(widths[i]!);
        return colour ? colour(padded, i) : padded;
      })
      .join("  ")
      .trimEnd();
  return {
    header: () => dim(pad(RUN_HEADERS)),
    row: (e, index) =>
      pad(
        [String(index + 1), e.type, e.virtualTime, e.status === null ? "—" : String(e.status), e.latencyMs === null ? "—" : `${e.latencyMs} ms`],
        (cell, col) => {
          if (col !== 3) return cell;
          if (e.status === null) return dim(cell);
          return e.status >= 200 && e.status < 300 ? green(cell) : red(cell);
        },
      ),
  };
}

/** Whole table at once (same layout as the live version). */
export function renderRunTable(result: RunResult, scenario?: Pick<Scenario, "steps">): string {
  const t = createRunTable(scenario ?? { steps: result.events.map((e) => ({ event: e.type })) });
  return [t.header(), ...result.events.map((e, i) => t.row(e, i))].join("\n");
}

export function renderRunSummary(result: RunResult): string {
  const total = result.events.length;
  const okCount = result.events.filter((e) => e.status !== null && e.status >= 200 && e.status < 300).length;
  const failed = result.events.filter((e) => e.status !== null && !(e.status >= 200 && e.status < 300)).length;
  const span = `${humanDays(result.virtualSpanMs)} (${result.startedAt.slice(0, 10)} → ${result.endedAt.slice(0, 10)})`;
  const counts = result.events.some((e) => e.status === null)
    ? `${total} events · dry run`
    : `${total} events · ${okCount} ok · ${failed} failed`;
  const exps = result.expectations;
  const expText = exps.length ? ` · ${exps.filter((e) => e.ok).length}/${exps.length} expectations passed` : "";
  const mark = result.ok ? green("✔") : red("✖");
  return `${mark} ${bold(counts)} · virtual span ${span}${expText}`;
}

export function renderFailedExpectations(result: RunResult): string[] {
  return result.expectations
    .filter((e) => !e.ok)
    .map((e) => {
      const where = e.scope === "step" ? `step ${e.step! + 1} ${result.events.find((ev) => ev.step === e.step)?.type ?? ""}` : "scenario";
      return `${red("✖")} expectation failed · ${where} · ${e.rule}: expected ${e.expected}, got ${e.actual}`;
    });
}
