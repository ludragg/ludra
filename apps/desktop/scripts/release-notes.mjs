import { appendFileSync, readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const { version } = read("../src-tauri/tauri.conf.json");
const release = read("../src/changelog.json").find((item) => item.version === version);

if (!release) {
  console.error(`Add release notes for ${version} to src/changelog.json`);
  process.exit(1);
}

const section = (title, items) =>
  items.length ? `### ${title}\n${items.map((item) => `- ${item}`).join("\n")}\n` : "";
const { pt, en } = release.notes;

const body = [
  "## Novidades da versão",
  section("Novidades", pt.features),
  section("Correções", pt.fixes),
  "## What's new",
  section("New", en.features),
  section("Fixes", en.fixes),
  "Baixe o instalador **ludra-installer.exe** abaixo.",
]
  .filter(Boolean)
  .join("\n");

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `body<<NOTES\n${body}\nNOTES\n`);
} else {
  console.log(body);
}
