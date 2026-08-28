import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const CLI = join(ROOT, "dist/cli.js");

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

interface Proc {
  child: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  waitFor: (re: RegExp, ms?: number) => Promise<void>;
  exit: () => Promise<number>;
}

function run(args: string[]): Proc {
  const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, NO_COLOR: "1" } });
  let out = "";
  let err = "";
  child.stdout.on("data", (c: Buffer) => (out += c.toString()));
  child.stderr.on("data", (c: Buffer) => (err += c.toString()));
  return {
    child,
    stdout: () => out,
    stderr: () => err,
    waitFor: (re, ms = 10_000) =>
      new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = (): void => {
          if (re.test(out)) return resolve();
          if (Date.now() - t0 > ms) return reject(new Error(`timeout waiting for ${re}; stdout=${out} stderr=${err}`));
          setTimeout(tick, 25);
        };
        tick();
      }),
    exit: () => new Promise((resolve) => child.on("exit", (code) => resolve(code ?? -1))),
  };
}

let listener: Proc;
let port: number;

beforeAll(async () => {
  execFileSync("npx", ["tsup"], { cwd: ROOT, stdio: "ignore" });
  port = await freePort();
  listener = run(["listen", "--port", String(port), "--auth-header", "Bearer dev"]);
  await listener.waitFor(/Listening on/);
});

afterAll(() => {
  listener.child.kill("SIGTERM");
});

describe("T-022 e2e: rcc send → rcc listen (separate processes)", () => {
  it("delivers a RENEWAL and both sides report success", async () => {
    const send = run(["send", "RENEWAL", "--to", `http://127.0.0.1:${port}/webhook`, "--auth-header", "Bearer dev"]);
    expect(await send.exit()).toBe(0);
    expect(send.stdout()).toMatch(/RENEWAL/);
    expect(send.stdout()).toMatch(/200/);
    await listener.waitFor(/RENEWAL/);
    expect(listener.stdout()).toMatch(/RENEWAL\s+\$RCAnonymousID:/);
  });

  it("auth mismatch: send exits 1 reporting 401, listen shows AUTH MISMATCH", async () => {
    const send = run(["send", "CANCELLATION", "--to", `http://127.0.0.1:${port}/webhook`, "--auth-header", "Bearer wrong"]);
    expect(await send.exit()).toBe(1);
    expect(send.stdout() + send.stderr()).toMatch(/401/);
    await listener.waitFor(/AUTH MISMATCH/);
  });
});
