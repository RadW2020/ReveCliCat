/** Set `value` at a dot path (`a.b.c`) inside `target`, creating intermediate objects. Mutates and returns `target`. */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    const next = cur[k];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      const fresh: Record<string, unknown> = {};
      cur[k] = fresh;
      cur = fresh;
    } else {
      cur = next as Record<string, unknown>;
    }
  }
  cur[keys[keys.length - 1]!] = value;
  return target;
}

/** Apply a map of dot-path overrides. */
export function applyOverrides(target: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(overrides)) setPath(target, k, v);
  return target;
}
