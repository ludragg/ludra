/**
 * Detector automático de jogos do Ludra (Electron / Node).
 *
 * Regras de privacidade e precisão:
 * - Varre processos a cada 10s (baixo consumo de CPU/memória).
 * - Executáveis genéricos (`javaw.exe`, `java.exe`, `UnityPlayer`, `wine`) NUNCA dão match
 *   sozinhos: exigem confirmação por `pathHints` no comando/caminho do processo.
 * - Nunca envia lista completa de processos, títulos de janelas de outros apps nem caminhos.
 * - O payload enviado ao backend contém SOMENTE `{ gameId, startedAt }`.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 60_000; // Backend limpa atividade após 3 min sem heartbeat
const CLOSE_GRACE_MS = 15_000;

const GENERIC_EXECUTABLES = new Set([
  "javaw.exe",
  "java.exe",
  "java",
  "unityplayer.exe",
  "wine",
  "wine64",
  "hl2.exe",
  "hd-player.exe",
  "ldvboxheadless.exe",
  "androidemulatoren.exe",
]);

/**
 * Lista processos com `{ name, cmd }` (apenas em memória local para comparação com o catálogo).
 */
async function listProcesses() {
  try {
    const psList = (await import("ps-list")).default;
    const list = await psList();
    return list.map((p) => ({
      name: (p.name || "").toLowerCase(),
      cmd: (p.cmd || "").toLowerCase(),
    }));
  } catch {
    if (process.platform === "win32") {
      return new Promise((resolve) => {
        execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true }, (err, stdout) => {
          if (err || !stdout) return resolve([]);
          const list = stdout
            .split(/\r?\n/)
            .map((line) => line.split(",")[0]?.replace(/^"|"$/g, "").trim().toLowerCase())
            .filter(Boolean)
            .map((name) => ({ name, cmd: "" }));
          resolve(list);
        });
      });
    }
    return [];
  }
}

class GameDetector {
  constructor({
    apiUrl = "",
    authToken = "",
    dataDir = "",
    showActivity = true,
    onChange = () => {},
  } = {}) {
    this.apiUrl = apiUrl;
    this.authToken = authToken;
    this.dataDir = dataDir;
    this.showActivity = showActivity;
    this.onChange = onChange;

    const localFile = JSON.parse(fs.readFileSync(path.join(__dirname, "games.json"), "utf8"));
    this.catalogVersion = localFile.version || "1.0.0";
    this.baseCatalog = Array.isArray(localFile.games) ? localFile.games : [];
    this.customCatalog = this.loadJson("custom-games.json", []);
    this.ignoredGameIds = new Set(this.loadJson("ignored-games.json", []));

    /** @type {Map<string, number>} gameId -> primeira vez visto */
    this.runningGames = new Map();
    /** @type {Array<{ gameId: string, name: string, iconUrl: string, startedAt: number, custom: boolean }>} */
    this.detectedList = [];
    /** @type {{ gameId: string, name: string, iconUrl: string, startedAt: number, custom: boolean } | null} */
    this.activeGame = null;

    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.graceTimer = null;
  }

  loadJson(filename, fallback) {
    if (!this.dataDir) return fallback;
    try {
      const full = path.join(this.dataDir, filename);
      if (fs.existsSync(full)) {
        return JSON.parse(fs.readFileSync(full, "utf8"));
      }
    } catch {
      // Ignora arquivo corrompido
    }
    return fallback;
  }

  saveJson(filename, value) {
    if (!this.dataDir) return;
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(path.join(this.dataDir, filename), JSON.stringify(value, null, 2));
  }

  /** Tenta atualizar o catálogo via `GET /games/catalog`, mantendo a cópia local como fallback */
  async refreshCatalogFromBackend() {
    if (!this.apiUrl) return;
    try {
      const res = await fetch(`${this.apiUrl}/games/catalog`);
      if (!res.ok) return;
      const remote = await res.json();
      if (Array.isArray(remote?.games) && remote.games.length > 0) {
        this.catalogVersion = remote.version || this.catalogVersion;
        this.baseCatalog = remote.games;
      }
    } catch {
      // Usa catálogo local de fallback
    }
  }

  addCustomGame(name, executablePath) {
    const exeName = path.basename(executablePath);
    const entry = {
      id: `custom-${Date.now()}`,
      name: String(name).trim(),
      executables: {
        win32: process.platform === "win32" ? [exeName] : [],
        darwin: process.platform === "darwin" ? [exeName] : [],
        linux: process.platform === "linux" ? [exeName] : [],
      },
      pathHints: [],
      iconUrl: "",
      custom: true,
    };
    this.customCatalog.push(entry);
    this.saveJson("custom-games.json", this.customCatalog);
    return entry;
  }

  ignoreGame(gameId) {
    this.ignoredGameIds.add(gameId);
    this.saveJson("ignored-games.json", Array.from(this.ignoredGameIds));
    if (this.activeGame?.gameId === gameId) {
      void this.clearRemoteActivity();
    }
  }

  clearHistory() {
    this.customCatalog = [];
    this.ignoredGameIds.clear();
    this.saveJson("custom-games.json", []);
    this.saveJson("ignored-games.json", []);
  }

  setPrivacy(showActivity) {
    this.showActivity = Boolean(showActivity);
    if (!this.showActivity && this.activeGame) {
      void this.clearRemoteActivity();
    }
  }

  getCatalog() {
    return [...this.baseCatalog, ...this.customCatalog];
  }

  start() {
    this.stop();
    void this.refreshCatalogFromBackend();
    void this.scanOnce();
    this.pollTimer = setInterval(() => void this.scanOnce(), POLL_INTERVAL_MS);
    this.heartbeatTimer = setInterval(() => {
      if (this.showActivity && this.activeGame) {
        void this.sendActivity({ gameId: this.activeGame.gameId, startedAt: this.activeGame.startedAt });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.pollTimer);
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.graceTimer);
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.graceTimer = null;
  }

  /** Verifica se um processo corresponde ao jogo respeitando a regra de executáveis genéricos */
  matchesGame(game, processes) {
    const exes = (game.executables?.[process.platform] ?? []).map((e) => String(e).toLowerCase());
    if (exes.length === 0) return false;
    const hints = (game.pathHints ?? []).map((h) => String(h).toLowerCase());

    for (const proc of processes) {
      if (!exes.includes(proc.name)) continue;

      if (GENERIC_EXECUTABLES.has(proc.name)) {
        // Executável genérico NUNCA identifica um jogo sozinho: exige confirmação por pathHints
        if (hints.length === 0 || !proc.cmd) continue;
        if (hints.some((hint) => proc.cmd.includes(hint))) {
          return true;
        }
        continue;
      }

      return true;
    }
    return false;
  }

  async scanOnce() {
    const processes = await listProcesses();
    const now = Date.now();
    const detected = [];

    for (const game of this.getCatalog()) {
      if (this.ignoredGameIds.has(game.id)) continue;

      if (this.matchesGame(game, processes)) {
        if (!this.runningGames.has(game.id)) {
          this.runningGames.set(game.id, now);
        }
        detected.push({
          gameId: game.id,
          name: game.name,
          iconUrl: game.iconUrl || "",
          startedAt: this.runningGames.get(game.id),
          custom: Boolean(game.custom),
        });
      } else {
        this.runningGames.delete(game.id);
      }
    }

    this.detectedList = detected;

    if (detected.length > 0) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;

      // Vários jogos abertos: mostra o que foi aberto por último
      detected.sort((a, b) => b.startedAt - a.startedAt);
      const latest = detected[0];

      if (!this.activeGame || this.activeGame.gameId !== latest.gameId) {
        this.activeGame = latest;
        this.onChange(this.activeGame, this.detectedList);
        if (this.showActivity) {
          // Envia SOMENTE { gameId, startedAt }
          await this.sendActivity({ gameId: latest.gameId, startedAt: latest.startedAt });
        }
      }
    } else if (this.activeGame && !this.graceTimer) {
      this.graceTimer = setTimeout(() => {
        this.graceTimer = null;
        void this.clearRemoteActivity();
      }, CLOSE_GRACE_MS);
    }
  }

  async sendActivity(payload) {
    if (!this.apiUrl) {
      console.log("[Ludra Desktop] PUT /users/me/activity (simulado):", JSON.stringify(payload));
      return;
    }
    try {
      await fetch(`${this.apiUrl}/users/me/activity`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[Ludra Desktop] Erro ao enviar atividade:", err.message);
    }
  }

  async clearRemoteActivity() {
    this.activeGame = null;
    this.onChange(null, []);
    if (!this.apiUrl) {
      console.log("[Ludra Desktop] DELETE /users/me/activity (simulado)");
      return;
    }
    try {
      await fetch(`${this.apiUrl}/users/me/activity`, {
        method: "DELETE",
        headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
      });
    } catch (err) {
      console.error("[Ludra Desktop] Erro ao limpar atividade:", err.message);
    }
  }
}

module.exports = {
  GameDetector,
  GENERIC_EXECUTABLES,
  POLL_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  CLOSE_GRACE_MS,
};
