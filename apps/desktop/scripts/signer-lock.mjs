import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node scripts/signer-lock.mjs <folder>");
  process.exit(1);
}

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const prefix = "node_modules/@tauri-apps/cli";
const cli = lock.packages[prefix];
if (!cli?.version || !cli.integrity) {
  console.error("@tauri-apps/cli is missing from package-lock.json");
  process.exit(1);
}

const name = "ludra-release-signer";
const dependencies = { "@tauri-apps/cli": cli.version };
const packages = { "": { name, dependencies } };

for (const [path, entry] of Object.entries(lock.packages)) {
  if (path !== prefix && !path.startsWith(`${prefix}-`)) {
    continue;
  }
  if (!entry.integrity) {
    console.error(`${path} has no integrity hash in package-lock.json`);
    process.exit(1);
  }
  const { dev, devOptional, ...rest } = entry;
  packages[path] = rest;
}

mkdirSync(folder, { recursive: true });
writeFileSync(join(folder, "package.json"), `${JSON.stringify({ name, private: true, dependencies }, null, 2)}\n`);
writeFileSync(
  join(folder, "package-lock.json"),
  `${JSON.stringify({ name, lockfileVersion: 3, requires: true, packages }, null, 2)}\n`,
);
console.log(`Signer pinned to @tauri-apps/cli ${cli.version} in ${folder}`);
