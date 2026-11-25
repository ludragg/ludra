import { invoke, isTauri } from "@tauri-apps/api/core";

import { redact } from "@/helpers/redact";
import { DiagnosticLevel } from "@/protocol/ludra/v1/client_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import type { Level } from "@/services/diagnostics";
import { systemDescription } from "@/services/system-info";
import { preferences } from "@/stores/preferences.svelte";

type Pending = {
  id: number;
  occurredAt: number;
  level: Level;
  area: string;
  message: string;
  detail: string;
  count: number;
  version: string;
};

const batchSize = 20;
const firstAfter = 5000;
const every = 60_000;

const levels: Record<Level, DiagnosticLevel> = {
  warning: DiagnosticLevel.WARNING,
  error: DiagnosticLevel.ERROR,
  crash: DiagnosticLevel.CRASH,
};

let client: Client | null = null;
let first = 0;
let timer = 0;
let sending = false;

export function startDiagnosticsUpload(next: Client) {
  stopDiagnosticsUpload();
  if (!isTauri()) {
    return;
  }
  client = next;
  first = window.setTimeout(flush, firstAfter);
  timer = window.setInterval(flush, every);
}

export function stopDiagnosticsUpload() {
  window.clearTimeout(first);
  window.clearInterval(timer);
  client = null;
}

async function flush() {
  const target = client;
  if (!target || sending || !preferences.values.errorReports) {
    return;
  }
  sending = true;
  try {
    const batch = (await invoke<Pending[]>("diagnostics_pending")).slice(0, batchSize);
    const system = batch.length ? await systemDescription() : "";
    if (!batch.length || !preferences.values.errorReports || client !== target) {
      return;
    }
    await target.reportDiagnostics(
      batch.map((report) => ({
        level: levels[report.level],
        area: report.area,
        message: redact(report.message),
        detail: redact(report.detail),
        occurrences: report.count,
        appVersion: report.version,
        occurredAtMs: BigInt(report.occurredAt),
      })),
      system,
    );
    await invoke("diagnostics_discard", { ids: batch.map(({ id }) => id) });
  } catch (cause) {
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_REQUEST && client === target) {
      stopDiagnosticsUpload();
    }
  } finally {
    sending = false;
  }
}
