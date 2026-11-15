<script lang="ts">
  import { t } from "@/i18n";
  import { trust } from "@/stores/trust.svelte";

  type Peer = { id: string; name: string };

  let { peers }: { peers: Peer[] } = $props();

  let open = $state(false);
  let numbers = $state<Record<string, string | null>>({});

  const changed = $derived(peers.filter(({ id }) => trust.changed[id]));

  $effect(() => {
    if (!open) {
      return;
    }
    for (const peer of peers) {
      trust.safetyNumber(peer.id).then((number) => (numbers[peer.id] = number));
    }
  });

  function onkeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      open = false;
    }
  }

  function onpointerdown(event: PointerEvent) {
    if (event.target === event.currentTarget) {
      open = false;
    }
  }
</script>

<svelte:window {onkeydown} />

<button
  class="call-security"
  class:call-security--warning={changed.length > 0}
  title={t("security.title")}
  onclick={() => (open = true)}
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
  {changed.length > 0 ? t("security.changed", { name: changed[0].name }) : t("security.encrypted")}
</button>

{#if open}
  <div class="call-security__overlay" role="presentation" {onpointerdown}>
    <div class="call-security__card" role="dialog" aria-modal="true" aria-labelledby="security-title">
      <h2 id="security-title" class="call-security__title">{t("security.title")}</h2>
      <p class="call-security__hint">{t("security.hint")}</p>
      <ul class="call-security__list">
        {#each peers as peer (peer.id)}
          <li class="call-security__peer">
            <span class="call-security__name">{peer.name}</span>
            <code class="call-security__number">{numbers[peer.id] ?? "…"}</code>
            {#if trust.changed[peer.id]}
              <span class="call-security__alert">{t("security.changedHint")}</span>
              <button class="call-security__accept" onclick={() => trust.accept(peer.id)}>
                {t("security.accept")}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="call-security__actions">
        <button class="call-security__close" onclick={() => (open = false)}>{t("security.close")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .call-security {
    padding: 2px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    transition: color ease 0.1s;
  }

  .call-security:hover {
    color: var(--muted-color);
  }

  .call-security svg {
    width: 13px;
    flex: none;
  }

  .call-security--warning,
  .call-security--warning:hover {
    color: #f3c611;
  }

  .call-security__overlay {
    position: fixed;
    inset: 32px 0 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .call-security__card {
    width: min(440px, calc(100vw - 48px));
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-radius: 12px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  }

  .call-security__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .call-security__hint {
    margin: 0;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .call-security__list {
    max-height: 320px;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    list-style: none;
  }

  .call-security__peer {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-radius: 8px;
    background: var(--surface-color);
  }

  .call-security__name {
    font-weight: 600;
    color: var(--muted-color);
  }

  .call-security__number {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: var(--hint-font-size);
    letter-spacing: 0.06em;
    word-spacing: 0.3em;
    color: var(--body-color);
  }

  .call-security__alert {
    font-size: var(--small-font-size);
    color: #f3c611;
  }

  .call-security__accept,
  .call-security__close {
    height: 32px;
    padding: 0 12px;
    align-self: flex-start;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    font-size: var(--hint-font-size);
    font-weight: 600;
  }

  .call-security__actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
