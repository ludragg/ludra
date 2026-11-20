/**
 * Script de validação do catálogo de jogos do Ludra (`desktop/games.json`).
 * Uso: `node desktop/validate-catalog.js`
 *
 * Verifica:
 * - Versão e array `games` com mínimo de 40 jogos
 * - Campos obrigatórios (`id`, `name`, `executables.{win32,darwin,linux}`)
 * - IDs únicos
 * - Executáveis genéricos (javaw.exe, java.exe, java, unityplayer.exe, wine) exigem `pathHints`
 * - Formato válido de `iconUrl` e `coverUrl`
 */

const fs = require("node:fs");
const path = require("node:path");

const GENERIC_EXES = new Set(["javaw.exe", "java.exe", "java", "unityplayer.exe", "wine", "wine64", "hl2.exe"]);

const file = path.join(__dirname, "games.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));

const errors = [];
if (!raw.version || typeof raw.version !== "string") {
  errors.push("Campo `version` ausente ou inválido.");
}
if (!Array.isArray(raw.games)) {
  errors.push("Campo `games` precisa ser um array.");
} else {
  if (raw.games.length < 40) {
    errors.push(`Catálogo precisa de no mínimo 40 jogos (atual: ${raw.games.length}).`);
  }
  const ids = new Set();
  for (const [idx, g] of raw.games.entries()) {
    const label = g.id || `#${idx}`;
    if (!g.id || typeof g.id !== "string") errors.push(`${label}: id obrigatório.`);
    if (ids.has(g.id)) errors.push(`${label}: id duplicado.`);
    ids.add(g.id);

    if (!g.name || typeof g.name !== "string") errors.push(`${label}: name obrigatório.`);
    if (!g.executables || !Array.isArray(g.executables.win32) || !Array.isArray(g.executables.darwin) || !Array.isArray(g.executables.linux)) {
      errors.push(`${label}: executables.{win32,darwin,linux} obrigatórios.`);
    } else {
      const allExes = [...g.executables.win32, ...g.executables.darwin, ...g.executables.linux].map((e) =>
        String(e).toLowerCase(),
      );
      if (allExes.some((exe) => GENERIC_EXES.has(exe))) {
        if (!Array.isArray(g.pathHints) || g.pathHints.length === 0) {
          errors.push(`${label}: executável genérico exige \`pathHints\` não vazio.`);
        }
      }
    }

    for (const urlField of ["iconUrl", "coverUrl"]) {
      const val = g[urlField];
      if (val && typeof val === "string" && !/^https:\/\/|^data:image\//.test(val)) {
        errors.push(`${label}: ${urlField} inválida (${val}).`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Falhas na validação do catálogo:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(`Catálogo v${raw.version} validado com sucesso (${raw.games.length} jogos).`);
