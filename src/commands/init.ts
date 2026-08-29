import type { Command } from "commander";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CONFIG_FILE, DEFAULT_TARGET, packageRoot } from "../core/config.js";
import { RccError } from "../core/errors.js";
import { println, type Io } from "../core/io.js";
import { bold, dim, green } from "../core/colors.js";

export interface InitOptions {
  force: boolean;
}

/** Create the config file and example scenarios in `cwd`. Returns the files written. */
export function initProject(cwd: string, opts: InitOptions): string[] {
  const scenariosSrc = join(packageRoot(), "scenarios");
  const examples = readdirSync(scenariosSrc).filter((f) => f.endsWith(".yaml")).sort();
  const targets = [CONFIG_FILE, ...examples.map((f) => join("scenarios", f))];

  const existing = targets.filter((t) => existsSync(join(cwd, t)));
  if (existing.length > 0 && !opts.force) {
    throw new RccError(`Refusing to overwrite existing file${existing.length === 1 ? "" : "s"}: ${existing.join(", ")}`, {
      hint: "Run `rcc init --force` to overwrite, or delete them first.",
    });
  }

  const written: string[] = [];
  const config = { to: DEFAULT_TARGET, store: "app_store", environment: "SANDBOX" };
  writeFileSync(join(cwd, CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
  written.push(CONFIG_FILE);
  mkdirSync(join(cwd, "scenarios"), { recursive: true });
  for (const f of examples) {
    copyFileSync(join(scenariosSrc, f), join(cwd, "scenarios", f));
    written.push(join("scenarios", f));
  }
  return written;
}

export function registerInit(program: Command, io: Io): void {
  program
    .command("init")
    .description(`Create ${CONFIG_FILE} and a scenarios/ folder with the six example scenarios in the current directory.`)
    .option("--force", "overwrite existing files", false)
    .addHelpText("after", `
Examples:
  $ rcc init
  $ rcc init --force`)
    .action((opts: InitOptions) => {
      const cwd = process.cwd();
      const written = initProject(cwd, opts);
      println(io.stdout, `${green("✔")} Created ${written.length} files in ${bold(relative(process.cwd(), cwd) || ".")}:`);
      for (const f of written) println(io.stdout, `  ${dim("+")} ${f}`);
      println(io.stdout, "");
      println(io.stdout, `Next: start your webhook handler (or \`rcc listen\`), then run`);
      println(io.stdout, `  ${bold("rcc run scenarios/trial-churns.yaml")}`);
      println(io.stdout, dim(`Defaults (target URL, auth header, store, environment) live in ${CONFIG_FILE}.`));
    });
}
