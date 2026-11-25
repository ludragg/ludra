import { invoke, isTauri } from "@tauri-apps/api/core";

export type Level = "warning" | "error" | "crash";

const ignored = [/ResizeObserver loop/];

function send(command: string, args: Record<string, unknown>) {
  if (isTauri()) {
    invoke(command, args).catch(() => undefined);
  }
}

export function setDiagnosticsEnabled(enabled: boolean) {
  send("diagnostics_enable", { enabled });
}

export function trail(area: string, message: string) {
  send("diagnostics_trail", { area, message });
}

export function report(level: Level, area: string, message: string, cause?: unknown) {
  if (cause instanceof Error && cause.name === "ServerError") {
    return;
  }
  const reason = cause === undefined ? "" : describe(cause);
  const full = reason ? `${message}: ${reason}` : message;
  if (ignored.some((pattern) => pattern.test(full))) {
    return;
  }
  const detail = cause instanceof Error ? (cause.stack ?? "") : "";
  send("diagnostics_record", { level, area, message: full, detail });
}

export function captureErrors(area: string) {
  window.addEventListener("error", (event) => {
    const origin = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
    report("error", area, `uncaught error${origin}`, event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    report("error", area, "unhandled rejection", event.reason);
  });
  const original = console.error.bind(console);
  console.error = (...values: unknown[]) => {
    original(...values);
    const cause = values.find((value) => value instanceof Error);
    report("error", area, cause ? "console error" : `console error: ${values.map(String).join(" ")}`, cause);
  };
}

function describe(cause: unknown): string {
  if (cause instanceof Error || cause instanceof DOMException) {
    return `${cause.name}: ${cause.message}`;
  }
  return String(cause);
}
