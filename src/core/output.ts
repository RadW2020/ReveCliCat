import { bold, dim, green, red } from "./colors.js";
import type { RunResult } from "./engine.js";

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

export function renderRunTable(result: RunResult): string {
  const rows = result.events.map((e, i) => [
    String(i + 1),
    e.type,
    e.virtualTime,
    e.status === null ? "—" : String(e.status),
    e.latencyMs === null ? "—" : `${e.latencyMs} ms`,
  ]);
  return table(["#", "event", "virtual time", "status", "latency"], rows, (cell, col, row) => {
    if (col !== 3) return cell;
    const status = result.events[row]!.status;
    if (status === null) return dim(cell);
    return status >= 200 && status < 300 ? green(cell) : red(cell);
  });
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
