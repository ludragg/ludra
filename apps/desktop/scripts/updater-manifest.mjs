import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    notes: { type: "string" },
    signature: { type: "string" },
    url: { type: "string" },
    out: { type: "string" },
  },
});

for (const option of ["notes", "signature", "url", "out"]) {
  if (!values[option]) {
    console.error(`Missing --${option}`);
    process.exit(1);
  }
}

const url = new URL(values.url);
if (url.protocol !== "https:") {
  console.error("The installer URL must use https");
  process.exit(1);
}

const signature = readFileSync(values.signature, "utf8").trim();
if (!signature) {
  console.error(`${values.signature} is empty`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const platform = { signature, url: url.href };

const manifest = {
  version,
  notes: readFileSync(values.notes, "utf8").trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64-nsis": platform,
    "windows-x86_64": platform,
  },
};

writeFileSync(values.out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${values.out} for ${version}`);
