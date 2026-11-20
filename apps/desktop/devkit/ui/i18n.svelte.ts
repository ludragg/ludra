const pt = {
  startAll: "Iniciar",
  stopAll: "Parar",
  language: "Idioma",
  minimize: "Minimizar",
  maximize: "Maximizar",
  restore: "Restaurar",
  closeWindow: "Fechar",
  services: "Serviços",
  database: "Banco de dados",
  server: "Servidor",
  interface: "Interface",
  app: "App",
  running: "Rodando",
  stopped: "Parado",
  starting: "Iniciando…",
  stopping: "Parando…",
  building: "Compilando…",
  databaseDetail: "Docker · 127.0.0.1:5433",
  dockerOff: "Docker desligado",
  serverDetail: "127.0.0.1:8080",
  serverSince: "127.0.0.1:8080 · {time}",
  external: "aberto fora do painel",
  interfaceDetail: "Vite · localhost:6767",
  appMissing: "ludradev.exe · ainda não compilado",
  appBuilt: "ludradev.exe · compilado {time}",
  appFailed: "Falhou ao compilar · veja o log",
  appStaged: "Nova versão pronta · reabra as contas",
  start: "Iniciar {name}",
  stop: "Parar {name}",
  restart: "Recompilar e reiniciar o servidor",
  build: "Compilar o app",
  reopen: "Reabrir as contas com a nova versão",
  smtp: "Enviar e-mails de verdade",
  smtpMissing: "Sem SMTP no .env: os códigos sempre aparecem aqui no painel.",
  checks: "Verificações",
  fix: "Corrigir formatação",
  run: "Rodar",
  accounts: "Contas",
  openGuest: "Abrir sem conta",
  closeGuest: "Fechar sem conta",
  addAccount: "Adicionar conta",
  editAccount: "Editar conta",
  login: "Usuário ou e-mail",
  password: "Senha",
  passwordKeep: "Deixe vazio para manter",
  cancel: "Cancelar",
  save: "Salvar",
  open: "Abrir",
  close: "Fechar",
  opening: "Abrindo…",
  stateOpen: "Aberto",
  stateClosed: "Fechado",
  more: "Mais opções de {name}",
  edit: "Editar",
  clear: "Limpar dados",
  remove: "Remover",
  confirmRemove: "Confirmar remoção",
  noAccounts: "Nenhuma conta ainda. Adicione uma conta do servidor local para abrir o Ludra Dev já logado nela.",
  codes: "Códigos de e-mail",
  verify: "confirmar e-mail",
  reset: "redefinir senha",
  twoFactor: "duas etapas",
  copy: "Copiar o código {code}",
  clearCodes: "Limpar códigos",
  clearLog: "Limpar log",
  emptyLog: "Nada por aqui ainda.",
  now: "agora",
  minutesAgo: "há {count} min",
  hoursAgo: "há {count} h",
  at: "às {time}",
  disconnected: "O painel perdeu a conexão. Abra o ludradev.bat de novo.",
  dismiss: "Fechar aviso",
  errorDockerOff: "O Docker não iniciou. Abra o Docker Desktop e tente de novo.",
  errorDatabaseStart: "O banco de dados não iniciou. Veja o log do servidor.",
  errorServerBuild: "O servidor não compilou. Veja o log do servidor.",
  errorServerStart: "O servidor não iniciou. Veja o log do servidor.",
  errorInterfaceStart: "A interface não iniciou. Veja o log da interface.",
  errorAppBuild: "O app não compilou. Veja o log do app.",
  errorCloseFirst: "Feche a conta antes de limpar os dados.",
  errorNotFound: "Essa conta não existe mais.",
  errorRequired: "Preencha todos os campos.",
  errorUnknown: "Algo deu errado: {error}",
};

const en: typeof pt = {
  startAll: "Start",
  stopAll: "Stop",
  language: "Language",
  minimize: "Minimize",
  maximize: "Maximize",
  restore: "Restore",
  closeWindow: "Close",
  services: "Services",
  database: "Database",
  server: "Server",
  interface: "Interface",
  app: "App",
  running: "Running",
  stopped: "Stopped",
  starting: "Starting…",
  stopping: "Stopping…",
  building: "Building…",
  databaseDetail: "Docker · 127.0.0.1:5433",
  dockerOff: "Docker is off",
  serverDetail: "127.0.0.1:8080",
  serverSince: "127.0.0.1:8080 · {time}",
  external: "started outside the panel",
  interfaceDetail: "Vite · localhost:6767",
  appMissing: "ludradev.exe · not built yet",
  appBuilt: "ludradev.exe · built {time}",
  appFailed: "Build failed · see the log",
  appStaged: "New build ready · reopen the accounts",
  start: "Start {name}",
  stop: "Stop {name}",
  restart: "Rebuild and restart the server",
  build: "Build the app",
  reopen: "Reopen the accounts with the new build",
  smtp: "Send real emails",
  smtpMissing: "No SMTP in .env: codes always show up here in the panel.",
  checks: "Checks",
  fix: "Fix formatting",
  run: "Run",
  accounts: "Accounts",
  openGuest: "Open without account",
  closeGuest: "Close without account",
  addAccount: "Add account",
  editAccount: "Edit account",
  login: "Username or email",
  password: "Password",
  passwordKeep: "Leave empty to keep it",
  cancel: "Cancel",
  save: "Save",
  open: "Open",
  close: "Close",
  opening: "Opening…",
  stateOpen: "Open",
  stateClosed: "Closed",
  more: "More options for {name}",
  edit: "Edit",
  clear: "Clear data",
  remove: "Remove",
  confirmRemove: "Confirm removal",
  noAccounts: "No accounts yet. Add an account from the local server to open Ludra Dev already signed in.",
  codes: "Email codes",
  verify: "confirm email",
  reset: "reset password",
  twoFactor: "two-step",
  copy: "Copy the code {code}",
  clearCodes: "Clear codes",
  clearLog: "Clear log",
  emptyLog: "Nothing here yet.",
  now: "just now",
  minutesAgo: "{count} min ago",
  hoursAgo: "{count} h ago",
  at: "at {time}",
  disconnected: "The panel lost its connection. Open ludradev.bat again.",
  dismiss: "Dismiss",
  errorDockerOff: "Docker did not start. Open Docker Desktop and try again.",
  errorDatabaseStart: "The database did not start. See the server log.",
  errorServerBuild: "The server did not build. See the server log.",
  errorServerStart: "The server did not start. See the server log.",
  errorInterfaceStart: "The interface did not start. See the interface log.",
  errorAppBuild: "The app did not build. See the app log.",
  errorCloseFirst: "Close the account before clearing its data.",
  errorNotFound: "That account no longer exists.",
  errorRequired: "Fill in every field.",
  errorUnknown: "Something went wrong: {error}",
};

export type MessageKey = keyof typeof pt;
export type Locale = "pt" | "en";

const storageKey = "ludradev.language";
const locale = $state<{ current: Locale }>({ current: initialLocale() });

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "pt" || stored === "en") {
      return stored;
    }
  } catch {
    return "pt";
  }
  return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function currentLocale(): Locale {
  return locale.current;
}

export function setLocale(next: Locale) {
  locale.current = next;
  document.documentElement.lang = localeTag();
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    return;
  }
}

export function localeTag(): string {
  return locale.current === "pt" ? "pt-BR" : "en";
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const messages = locale.current === "pt" ? pt : en;
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}

export function describeError(code: string): string {
  const key = `error${code.charAt(0).toUpperCase()}${code.slice(1)}`;
  return key in pt ? t(key as MessageKey) : t("errorUnknown", { error: code });
}

export function since(timestamp: number, now: number): string {
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) {
    return t("now");
  }
  return minutes < 60 ? t("minutesAgo", { count: minutes }) : t("hoursAgo", { count: Math.floor(minutes / 60) });
}

export function clock(timestamp: number): string {
  const time = new Date(timestamp).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  return t("at", { time });
}
