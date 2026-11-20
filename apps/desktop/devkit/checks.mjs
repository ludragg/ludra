import { join } from "node:path";
import { changed, log } from "./hub.mjs";
import { desktopDir, serverDir, tauriDir } from "./paths.mjs";
import { run } from "./process.mjs";

const node = process.execPath;
const prettier = join(desktopDir, "node_modules", "prettier", "bin", "prettier.cjs");
const svelteCheck = join(desktopDir, "node_modules", "svelte-check", "bin", "svelte-check");

const checks = [
  {
    id: "prettier",
    label: "Prettier",
    cwd: desktopDir,
    command: [node, prettier, "--check", "."],
    fix: [node, prettier, "--write", "."],
  },
  {
    id: "svelte",
    label: "svelte-check",
    cwd: desktopDir,
    command: [node, svelteCheck, "--tsconfig", "./tsconfig.json"],
  },
  { id: "rustfmt", label: "cargo fmt", cwd: tauriDir, command: ["cargo", "fmt", "--check"], fix: ["cargo", "fmt"] },
  { id: "cargo", label: "cargo check", cwd: tauriDir, command: ["cargo", "check", "--locked", "--color", "never"] },
  {
    id: "gofmt",
    label: "gofmt",
    cwd: serverDir,
    command: ["gofmt", "-l", "."],
    fix: ["gofmt", "-w", "."],
    silent: true,
  },
  { id: "govet", label: "go vet", cwd: serverDir, command: ["go", "vet", "./..."] },
];

const results = Object.fromEntries(checks.map((check) => [check.id, "idle"]));
let active = null;

export function checksState() {
  return { checks: checks.map(({ id, label }) => ({ id, label, state: results[id] })), checking: active !== null };
}

export function runChecks() {
  active ??= (async () => {
    for (const check of checks) {
      results[check.id] = "pending";
    }
    changed();
    for (const check of checks) {
      results[check.id] = "running";
      changed();
      results[check.id] = (await execute(check, check.command)) ? "passed" : "failed";
      changed();
    }
  })().finally(() => {
    active = null;
    changed();
  });
  return active;
}

export async function fixFormatting() {
  if (active) {
    return;
  }
  for (const check of checks.filter((entry) => entry.fix)) {
    await execute(check, check.fix);
  }
  await runChecks();
}

async function execute(check, [command, ...args]) {
  log("checks", `> ${check.label} ${args.filter((arg) => !arg.includes("node_modules")).join(" ")}`);
  const started = run(command, args, { cwd: check.cwd, channel: "checks" });
  let printed = false;
  started.child.stdout.on("data", () => (printed = true));
  const code = await started.done;
  const passed = code === 0 && !(check.silent && printed);
  log("checks", passed ? "ok\n" : "failed\n");
  return passed;
}
