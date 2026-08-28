import { randomUUID } from "node:crypto";

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** RFC-4122 v4-shaped UUID. */
  uuid(): string;
  /** n lowercase hex characters. */
  hex(n: number): string;
}

/** FNV-1a 32-bit hash, used to turn string seeds into numbers. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, deterministic PRNG. Plenty for generating IDs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = "0123456789abcdef";

export function normalizeSeed(seed: number | string): number {
  return typeof seed === "number" ? seed >>> 0 : fnv1a(seed);
}

/** Create a random source. With a seed the sequence is fully deterministic. */
export function createRng(seed?: number | string): Rng {
  const seeded = seed !== undefined;
  const next = seeded ? mulberry32(normalizeSeed(seed)) : Math.random;
  const hex = (n: number): string => {
    let s = "";
    for (let i = 0; i < n; i++) s += HEX[Math.floor(next() * 16)];
    return s;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    hex,
    uuid: () => {
      if (!seeded) return randomUUID();
      const variant = HEX[8 + Math.floor(next() * 4)];
      return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
    },
  };
}
