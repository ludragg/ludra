<script lang="ts">
  import { tick } from "svelte";
  import { t } from "./i18n.svelte";
  import Icon from "./icon.svelte";
  import { channels, panel, type Channel } from "./store.svelte";

  let selected = $state<Channel>("server");
  let output = $state<HTMLElement>();

  const text = $derived(panel.logs[selected].join("\n"));

  $effect.pre(() => {
    void text;
    if (!output) {
      return;
    }
    const pinned = output.scrollHeight - output.scrollTop - output.clientHeight < 24;
    if (pinned) {
      void tick().then(() => output && (output.scrollTop = output.scrollHeight));
    }
  });
</script>

<section class="logs">
  <div class="logs__bar" role="tablist">
    {#each channels as channel (channel)}
      <button
        type="button"
        role="tab"
        class="logs__tab"
        class:logs__tab--selected={selected === channel}
        aria-selected={selected === channel}
        onclick={() => (selected = channel)}
      >
        {t(channel)}
      </button>
    {/each}
    <span class="logs__spacer"></span>
    <button
      type="button"
      class="icon-button"
      aria-label={t("clearLog")}
      onclick={() => panel.act("logs/clear", { channel: selected })}
    >
      <Icon name="trash" />
    </button>
  </div>
  <pre class="logs__output" bind:this={output}>{text || t("emptyLog")}</pre>
</section>

<style>
  .logs {
    min-height: 260px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
  }

  .logs__bar {
    padding: 6px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    border-bottom: 1px solid var(--border-color);
  }

  .logs__tab {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--hint-font-size);
    font-weight: 600;
  }

  .logs__tab:hover {
    color: var(--muted-color);
  }

  .logs__tab--selected {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .logs__spacer {
    flex-grow: 1;
  }

  .logs__output {
    min-height: 0;
    margin: 0;
    padding: 12px 14px;
    flex: 1 1 0;
    overflow: auto;
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: var(--small-font-size);
    line-height: 1.6;
    color: var(--body-color);
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
</style>
