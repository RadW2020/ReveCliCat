import { RccError } from "./errors.js";

export interface Duration {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export class InvalidDurationError extends RccError {
  constructor(input: string) {
    super(
      input === "" ? "Duration is empty." : `Invalid ISO-8601 duration: "${input}".`,
      { hint: "Use the form PnYnMnWnDTnHnMnS, e.g. P1M (one month), P1W (one week), P3D, PT12H." },
    );
    this.name = "InvalidDurationError";
  }
}

export class ClockError extends RccError {
  constructor(message: string, hint?: string) {
    super(message, hint === undefined ? {} : { hint });
    this.name = "ClockError";
  }
}

const DURATION_RE = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Parse an ISO-8601 duration (`P1M`, `P1W`, `P1M2DT3H`, ...). Fractions are not supported. */
export function parseDuration(input: string): Duration {
  if (input === "") throw new InvalidDurationError(input);
  const m = DURATION_RE.exec(input);
  if (!m || input === "P" || input.endsWith("T")) throw new InvalidDurationError(input);
  const n = (i: number): number => (m[i] === undefined ? 0 : Number(m[i]));
  return {
    years: n(1),
    months: n(2),
    weeks: n(3),
    days: n(4),
    hours: n(5),
    minutes: n(6),
    seconds: n(7),
  };
}

export function formatDuration(d: Duration): string {
  let out = "P";
  if (d.years) out += `${d.years}Y`;
  if (d.months) out += `${d.months}M`;
  if (d.weeks) out += `${d.weeks}W`;
  if (d.days) out += `${d.days}D`;
  if (d.hours || d.minutes || d.seconds) {
    out += "T";
    if (d.hours) out += `${d.hours}H`;
    if (d.minutes) out += `${d.minutes}M`;
    if (d.seconds) out += `${d.seconds}S`;
  }
  return out === "P" ? "PT0S" : out;
}

export function isZeroDuration(d: Duration): boolean {
  return Object.values(d).every((v) => v === 0);
}

const MS = { second: 1_000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

/** Add a duration to a UTC instant (ms). Years/months are calendar-aware with day clamping. */
export function addDuration(ms: number, d: Duration): number {
  const date = new Date(ms);
  if (d.years || d.months) {
    const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + d.years * 12 + d.months;
    const year = Math.floor(totalMonths / 12);
    const month = totalMonths % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(date.getUTCDate(), lastDay);
    date.setUTCFullYear(year, month, day);
  }
  return (
    date.getTime() +
    d.weeks * MS.week +
    d.days * MS.day +
    d.hours * MS.hour +
    d.minutes * MS.minute +
    d.seconds * MS.second
  );
}

/** Fixed instant used as the start of every seeded simulation. */
export const SEEDED_EPOCH_MS = Date.UTC(2025, 0, 1);

/** A clock that only moves forward, in simulated time. */
export class VirtualClock {
  private current: number;

  constructor(startMs: number) {
    this.current = startMs;
  }

  /** Seeded runs start at a fixed epoch so payloads are reproducible; unseeded runs start now. */
  static forSeed(seed: number | string | undefined, startAt?: number): VirtualClock {
    if (startAt !== undefined) return new VirtualClock(startAt);
    return new VirtualClock(seed === undefined ? Date.now() : SEEDED_EPOCH_MS);
  }

  now(): number {
    return this.current;
  }

  iso(): string {
    return new Date(this.current).toISOString();
  }

  /** Advance by a Duration or ISO-8601 string. Returns the new now(). */
  advance(duration: Duration | string): number {
    const d = typeof duration === "string" ? parseDuration(duration) : duration;
    if (isZeroDuration(d)) {
      throw new ClockError(
        `Cannot advance the clock by a zero-length duration (${formatDuration(d)}).`,
        "The virtual clock only moves forward; use a positive duration such as P1D.",
      );
    }
    const next = addDuration(this.current, d);
    if (next <= this.current) {
      throw new ClockError("The virtual clock cannot move backwards.");
    }
    this.current = next;
    return next;
  }
}
