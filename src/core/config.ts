import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RccError } from "./errors.js";
import { CLI_STORES, ENVIRONMENTS } from "../schemas/common.js";

export const CONFIG_FILE = "reveclicat.config.json";
export const DEFAULT_TARGET = "http://localhost:3000/webhook";

export const ConfigSchema = z.strictObject({
  to: z.url({ error: "`to` must be an absolute http(s) URL." }).optional(),
  authHeader: z.string().optional(),
  store: z.enum(CLI_STORES, { error: `\`store\` must be one of: ${CLI_STORES.join(", ")}.` }).optional(),
  environment: z.enum(ENVIRONMENTS, { error: `\`environment\` must be one of: ${ENVIRONMENTS.join(", ")}.` }).optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

/** Read `reveclicat.config.json` from `dir` (default cwd). Missing file → {}. Invalid → RccError. */
export function loadConfig(dir: string = process.cwd()): Config {
  const file = join(dir, CONFIG_FILE);
  if (!existsSync(file)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (cause) {
    throw new RccError(`${file} is not valid JSON.`, { hint: "Fix the file or delete it and run `rcc init` again.", cause });
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const detail =
      issue.code === "unrecognized_keys"
        ? `unknown key ${issue.keys.map((k) => `"${k}"`).join(", ")} (allowed: to, authHeader, store, environment)`
        : `${issue.path.join(".")}: ${issue.message}`;
    throw new RccError(`${file}: ${detail}`, { hint: "See the config format in the README." });
  }
  return result.data;
}

export interface ResolvedDefaults {
  to: string;
  authHeader: string | undefined;
  /** Not yet validated — the command validates against CLI_STORES / ENVIRONMENTS. */
  store: string;
  environment: string;
}

/** Precedence: explicit flag > config file > built-in default. Strings are validated later by the command. */
export function resolveDefaults(
  flags: { to?: string | undefined; authHeader?: string | undefined; store?: string | undefined; environment?: string | undefined },
  config: Config,
): ResolvedDefaults {
  return {
    to: flags.to ?? config.to ?? DEFAULT_TARGET,
    authHeader: flags.authHeader ?? config.authHeader,
    store: flags.store ?? config.store ?? "app_store",
    environment: flags.environment ?? config.environment ?? "SANDBOX",
  };
}

/** Root of the installed `reveclicat` package (works from src/, dist/ and node_modules). */
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name === "reveclicat") return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = dirname(dir);
  }
  throw new RccError("Could not locate the reveclicat package root.", { hint: "Reinstall the package: npm i -g reveclicat" });
}
