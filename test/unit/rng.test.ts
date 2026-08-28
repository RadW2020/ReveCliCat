import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/rng.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("T-012 createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.uuid(), a.uuid(), a.int(1000), a.hex(8)];
    const seqB = [b.uuid(), b.uuid(), b.int(1000), b.hex(8)];
    expect(seqA).toEqual(seqB);
  });
  it("differs across seeds and accepts string seeds", () => {
    expect(createRng(1).uuid()).not.toBe(createRng(2).uuid());
    expect(createRng("alpha").uuid()).toBe(createRng("alpha").uuid());
    expect(createRng("alpha").uuid()).not.toBe(createRng("beta").uuid());
  });
  it("produces v4-shaped uuids", () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) expect(rng.uuid()).toMatch(UUID_V4);
    expect(createRng().uuid()).toMatch(UUID_V4);
  });
  it("int(max) is within range and next() in [0,1)", () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      const n = rng.int(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
  it("unseeded rngs are not equal to each other", () => {
    expect(createRng().uuid()).not.toBe(createRng().uuid());
  });
});
