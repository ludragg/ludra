<script lang="ts">
  import Checkbox from "@/components/checkbox/checkbox.svelte";
  import { clock, since, t, type MessageKey } from "./i18n.svelte";
  import Icon from "./icon.svelte";
  import { panel, type PanelState } from "./store.svelte";

  type Action = { icon: "play" | "stop" | "restart" | "build"; label: string; action: string };
  type Row = {
    key: MessageKey;
    status: string;
    detail: string;
    tone: "on" | "busy" | "off" | "bad";
    actions: Action[];
  };

  let { snapshot }: { snapshot: PanelState } = $props();

  let now = $state(Date.now());

  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30000);
    return () => clearInterval(timer);
  });

  const rows = $derived.by((): Row[] => {
    const { database, server, interface: ui, app } = snapshot.services;
    return [
      {
        key: "database",
        status: database.state,
        detail: database.docker ? t("databaseDetail") : t("dockerOff"),
        tone: tone(database.state),
        actions: [toggle("database", database.state)],
      },
      {
        key: "server",
        status: server.state,
        detail: server.external
          ? `${t("serverDetail")} · ${t("external")}`
          : server.since
            ? t("serverSince", { time: since(server.since, now) })
            : t("serverDetail"),
        tone: tone(server.state),
        actions: [
          ...(server.state === "running"
            ? [{ icon: "restart" as const, label: t("restart"), action: "server/restart" }]
            : []),
          toggle("server", server.state),
        ],
      },
      {
        key: "interface",
        status: ui.state,
        detail: ui.external ? `${t("interfaceDetail")} · ${t("external")}` : t("interfaceDetail"),
        tone: tone(ui.state),
        actions: [toggle("interface", ui.state)],
      },
      {
        key: "app",
        status: app.state,
        detail:
          app.state === "failed"
            ? t("appFailed")
            : app.staged
              ? t("appStaged")
              : app.builtAt
                ? t("appBuilt", { time: clock(app.builtAt) })
                : t("appMissing"),
        tone: app.state === "building" ? "busy" : app.state === "failed" ? "bad" : app.builtAt ? "on" : "off",
        actions: [
          ...(app.staged ? [{ icon: "restart" as const, label: t("reopen"), action: "app/reopen" }] : []),
          { icon: "build", label: t("build"), action: "app/build" },
        ],
      },
    ];
  });

  function tone(status: string): Row["tone"] {
    return status === "running" ? "on" : status === "stopped" ? "off" : "busy";
  }

  function toggle(service: "database" | "server" | "interface", status: string): Action {
    const name = t(service).toLowerCase();
    return status === "stopped"
      ? { icon: "play", label: t("start", { name }), action: `${service}/start` }
      : { icon: "stop", label: t("stop", { name }), action: `${service}/stop` };
  }

  function busy(row: Row) {
    return row.tone === "busy";
  }
</script>

<section class="services">
  <h2 class="section-title">{t("services")}</h2>

  {#each rows as row (row.key)}
    <div class="services__row">
      <span class="services__dot services__dot--{row.tone}"></span>
      <div class="services__text">
        <span class="services__name">{t(row.key)}</span>
        <span class="services__detail">
          {#if busy(row)}{t(row.status as MessageKey)} ·{/if}
          {row.detail}
        </span>
      </div>
      {#each row.actions as action (action.action)}
        <button
          type="button"
          class="icon-button"
          aria-label={action.label}
          data-tooltip={action.label}
          disabled={busy(row)}
          onclick={() => panel.act(action.action)}
        >
          <Icon name={action.icon} />
        </button>
      {/each}
    </div>
  {/each}

  <div class="services__smtp">
    <Checkbox
      label={t("smtp")}
      checked={snapshot.smtp.enabled && snapshot.smtp.available}
      disabled={!snapshot.smtp.available}
      onchange={(enabled) => panel.act("smtp", { enabled })}
    />
    {#if !snapshot.smtp.available}
      <p class="services__hint">{t("smtpMissing")}</p>
    {/if}
  </div>
</section>

<style>
  .services {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .services .section-title {
    margin-bottom: 4px;
  }

  .services__row {
    padding: 10px 8px 10px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 8px;
    background: var(--surface-color);
  }

  .services__dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--subtle-color);
  }

  .services__dot--on {
    background: var(--success-color);
  }

  .services__dot--busy {
    background: var(--warning-color);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .services__dot--bad {
    background: var(--error-color);
  }

  .services__text {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.35;
  }

  .services__name {
    font-weight: 600;
    color: var(--muted-color);
  }

  .services__detail {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .services__smtp {
    margin-top: 4px;
  }

  .services__hint {
    margin: -6px 0 0 28px;
    font-size: var(--small-font-size);
    line-height: 1.4;
    color: var(--subtle-color);
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
