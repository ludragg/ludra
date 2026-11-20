/**
 * Agente Desktop do Ludra (Electron) — roda em segundo plano na bandeja do sistema.
 * - Exibe aviso de transparência na primeira execução.
 * - Detecta jogos do catálogo a cada 10s e envia apenas `{ gameId, startedAt }`.
 */

const fs = require("node:fs");
const path = require("node:path");
const { app, Tray, Menu, dialog, nativeImage } = require("electron");
const { GameDetector } = require("./detector");

let tray = null;
let detector = null;

async function ensureFirstRunNotice(dataDir) {
  const flagPath = path.join(dataDir, "first-run-ack.json");
  if (fs.existsSync(flagPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(flagPath, "utf8"));
      return saved.enabled !== false;
    } catch {
      return true;
    }
  }

  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "Ludra — Detecção de jogos",
    message: "O Ludra verifica quais jogos estão abertos para mostrar sua atividade. Nenhuma outra informação é coletada.",
    buttons: ["Ativar detecção", "Desativar detecção"],
    defaultId: 0,
    cancelId: 1,
  });

  const enabled = response === 0;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(flagPath, JSON.stringify({ enabled, acknowledgedAt: Date.now() }, null, 2));
  return enabled;
}

function rebuildTrayMenu(currentGame) {
  if (!tray) return;
  const statusLabel = currentGame ? `Jogando: ${currentGame.name}` : "Nenhum jogo detectado";

  const template = [
    { label: "Ludra — Detecção de Jogos", enabled: false },
    { label: statusLabel, enabled: false },
    { type: "separator" },
    {
      label: "Compartilhar minha atividade",
      type: "checkbox",
      checked: detector?.showActivity ?? true,
      click: (item) => detector?.setPrivacy(item.checked),
    },
    ...(currentGame
      ? [
          {
            label: `Ignorar "${currentGame.name}" (não é um jogo)`,
            click: () => detector?.ignoreGame(currentGame.gameId),
          },
        ]
      : []),
    {
      label: "Adicionar jogo manualmente…",
      click: async () => {
        const result = await dialog.showOpenDialog({
          title: "Selecionar executável do jogo",
          filters: [{ name: "Executáveis", extensions: ["exe", "app", "sh"] }],
          properties: ["openFile"],
        });
        if (!result.canceled && result.filePaths[0]) {
          const exePath = result.filePaths[0];
          const gameName = path.basename(exePath, path.extname(exePath));
          const added = detector.addCustomGame(gameName, exePath);
          console.log("[Ludra Desktop] Jogo personalizado registrado:", added.name);
        }
      },
    },
    {
      label: "Apagar histórico de jogos",
      click: () => detector?.clearHistory(),
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        detector?.stop();
        app.quit();
      },
    },
  ];

  tray.setToolTip(`Ludra — ${statusLabel}`);
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  const dataDir = app.getPath("userData");
  const detectionEnabled = await ensureFirstRunNotice(dataDir);

  tray = new Tray(nativeImage.createEmpty());
  detector = new GameDetector({
    apiUrl: process.env.LUDRA_API_URL || "",
    authToken: process.env.LUDRA_TOKEN || "",
    dataDir,
    showActivity: detectionEnabled,
    onChange: (game) => rebuildTrayMenu(game),
  });

  rebuildTrayMenu(null);
  detector.start();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
