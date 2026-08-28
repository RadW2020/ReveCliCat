import { describe, expect, it } from "vitest";
import {
  ClockError,
  InvalidDurationError,
  VirtualClock,
  addDuration,
  parseDuration,
  formatDuration,
} from "../../src/core/clock.js";

const T0 = Date.UTC(2025, 0, 1); // 2025-01-01T00:00:00Z

describe("T-012 parseDuration", () => {
  it("parses common ISO-8601 durations", () => {
    expect(parseDuration("P1M")).toEqual({ years: 0, months: 1, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(parseDuration("P1W")).toMatchObject({ weeks: 1 });
    expect(parseDuration("P3D")).toMatchObject({ days: 3 });
    expect(parseDuration("PT1H")).toMatchObject({ hours: 1 });
    expect(parseDuration("P1Y")).toMatchObject({ years: 1 });
    expect(parseDuration("P1M2DT3H")).toMatchObject({ months: 1, days: 2, hours: 3 });
    expect(parseDuration("PT90S")).toMatchObject({ seconds: 90 });
    expect(parseDuration("P1M2W")).toMatchObject({ months: 1, weeks: 2 });
  });

  it("rejects invalid strings with the input in the message", () => {
    for (const bad of ["", "P", "1M", "PT", "P1X", "P1.5M", "P-1D", "p1m", "P1MT"]) {
      expect(() => parseDuration(bad), bad).toThrow(InvalidDurationError);
      expect(() => parseDuration(bad), bad).toThrow(bad === "" ? /empty/ : bad);
    }
  });

  it("formats back to ISO-8601", () => {
    expect(formatDuration(parseDuration("P1M2DT3H"))).toBe("P1M2DT3H");
    expect(formatDuration(parseDuration("P1W"))).toBe("P1W");
  });
});

describe("T-012 addDuration (UTC, calendar-aware)", () => {
  it("adds months with day clamping", () => {
    const jan31 = Date.UTC(2025, 0, 31, 10, 30);
    expect(new Date(addDuration(jan31, parseDuration("P1M"))).toISOString()).toBe("2025-02-28T10:30:00.000Z");
    const jan31Leap = Date.UTC(2024, 0, 31);
    expect(new Date(addDuration(jan31Leap, parseDuration("P1M"))).toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });
  it("adds years, weeks, days and time as expected", () => {
    expect(addDuration(T0, parseDuration("P1Y"))).toBe(Date.UTC(2026, 0, 1));
    expect(addDuration(T0, parseDuration("P1W"))).toBe(T0 + 7 * 86_400_000);
    expect(addDuration(T0, parseDuration("P3D"))).toBe(T0 + 3 * 86_400_000);
    expect(addDuration(T0, parseDuration("PT1H30M"))).toBe(T0 + 90 * 60_000);
    expect(addDuration(T0, parseDuration("P1M2DT3H"))).toBe(Date.UTC(2025, 1, 3, 3));
  });
});

describe("T-012 VirtualClock", () => {
  it("starts at the given instant and only moves forward", () => {
    const clock = new VirtualClock(T0);
    expect(clock.now()).toBe(T0);
    expect(clock.advance(parseDuration("P1M"))).toBe(Date.UTC(2025, 1, 1));
    expect(clock.now()).toBe(Date.UTC(2025, 1, 1));
    expect(clock.iso()).toBe("2025-02-01T00:00:00.000Z");
  });
  it("accepts duration strings directly", () => {
    const clock = new VirtualClock(T0);
    clock.advance("P1W");
    expect(clock.now()).toBe(T0 + 7 * 86_400_000);
  });
  it("throws on zero-length durations", () => {
    const clock = new VirtualClock(T0);
    expect(() => clock.advance("PT0S")).toThrow(ClockError);
    expect(clock.now()).toBe(T0);
  });
  it("defaults: seeded → fixed epoch, unseeded → now", () => {
    expect(VirtualClock.forSeed(42).now()).toBe(T0);
    const before = Date.now();
    const unseeded = VirtualClock.forSeed(undefined).now();
    expect(unseeded).toBeGreaterThanOrEqual(before);
    expect(unseeded).toBeLessThanOrEqual(Date.now());
  });
});
