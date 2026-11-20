import { describeError, t } from "./i18n.svelte";

export type ServiceState = "running" | "stopped" | "starting" | "stopping";
export type ProfileState = "open" | "opening" | "closed";
export type CheckState = "idle" | "pending" | "running" | "passed" | "failed";
export type Channel = "server" | "interface" | "app" | "checks";

export type Account = { id: string; login: string; state: ProfileState };
export type Check = { id: string; label: string; state: CheckState };
export type Code = { id: string; user: string; purpose: "verify" | "reset" | "twoFactor"; code: string };

export type PanelState = {
  version: string;
  services: {
    database: { state: ServiceState; docker: boolean };
    server: { state: ServiceState; since: number | null; external: boolean };
    interface: { state: ServiceState; external: boolean };
    app: { state: "ready" | "missing" | "building" | "failed"; builtAt: number | null; staged: boolean };
  };
  smtp: { enabled: boolean; available: boolean };
  accounts: Account[];
  guest: ProfileState;
  checks: Check[];
  checking: boolean;
  codes: Code[];
};

export const channels: Channel[] = ["server", "interface", "app", "checks"];

const maxLines = 1500;

class Panel {
  state = $state<PanelState | null>(null);
  logs = $state<Record<Channel, string[]>>({ server: [], interface: [], app: [], checks: [] });
  notice = $state("");
  connected = $state(true);

  constructor() {
    const events = new EventSource("/api/events");
    events.addEventListener("state", (event) => (this.state = JSON.parse(event.data)));
    events.addEventListener("logs", (event) => (this.logs = JSON.parse(event.data)));
    events.addEventListener("log", (event) => {
      const { channel, lines } = JSON.parse(event.data) as { channel: Channel; lines: string[] };
      const buffer = this.logs[channel];
      buffer.push(...lines);
      buffer.splice(0, buffer.length - maxLines);
    });
    events.onopen = () => (this.connected = true);
    events.onerror = () => (this.connected = false);
  }

  async act(action: string, body: object = {}): Promise<boolean> {
    try {
      const response = await fetch(`/api/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return true;
      }
      const { error } = (await response.json()) as { error: string };
      this.notice = describeError(error);
    } catch {
      this.notice = t("disconnected");
    }
    return false;
  }
}

export const panel = new Panel();
