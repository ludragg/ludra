<script lang="ts">
  import { t } from "@/i18n";
  import { chat } from "@/stores/chat.svelte";

  let notice = $state(false);

  const home = $derived(chat.activeId !== null || chat.view === "friends");
  const unread = $derived(Object.values(chat.unread).reduce((total, count) => total + count, 0));
  const alert = $derived(
    [
      unread > 0 ? t("sidebar.unread", { count: unread }) : "",
      chat.incoming > 0 ? t("sidebar.pendingRequests", { count: chat.incoming }) : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
</script>

<nav class="rail" aria-label={t("rail.label")}>
  <span class="rail__item">
    <button
      class="rail__button"
      class:rail__button--active={home}
      aria-label={t("rail.home")}
      aria-current={home ? "page" : undefined}
      data-tooltip={alert ? `${t("rail.home")} · ${alert}` : t("rail.home")}
      onclick={() => chat.showFriends()}
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
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path
          d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        />
      </svg>
    </button>
    {#if alert}
      <span class="rail__dot" class:rail__dot--active={home} role="img" aria-label={alert}></span>
    {/if}
  </span>

  <span class="rail__item">
    <button
      class="rail__button rail__button--add"
      aria-label={t("rail.create")}
      aria-describedby="rail-soon"
      onpointerenter={() => (notice = true)}
      onpointerleave={() => (notice = false)}
      onfocus={() => (notice = true)}
      onblur={() => (notice = false)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
    {#if notice}
      <span id="rail-soon" class="rail__notice" role="tooltip">
        <strong class="rail__notice-title">{t("rail.soonTitle")}</strong>
        {t("rail.soon")}
      </span>
    {/if}
  </span>
</nav>

<style>
  .rail {
    width: 56px;
    flex: none;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: var(--dark-background-color);
    border-right: 1px solid var(--border-color);
  }

  .rail__item {
    position: relative;
    display: flex;
  }

  .rail__button {
    width: 40px;
    height: 40px;
    padding: 10px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .rail__button:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .rail__button--active,
  .rail__button--active:hover {
    background: rgba(199, 125, 255, 0.16);
    color: var(--brand-color);
  }

  .rail__button--add {
    width: 32px;
    height: 32px;
    padding: 8px;
    border-radius: 8px;
    border: 1px dashed rgba(255, 255, 255, 0.16);
  }

  .rail__button--add:hover {
    border-color: var(--brand-color);
    background: rgba(199, 125, 255, 0.08);
    color: var(--brand-color);
  }

  .rail__dot {
    position: absolute;
    top: 10px;
    right: 12px;
    pointer-events: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand-color);
  }

  .rail__dot--active {
    box-shadow: 0 0 0 1px #18111c;
  }

  .rail__notice {
    position: absolute;
    top: 50%;
    left: calc(100% + 12px);
    z-index: 30;
    width: 220px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transform: translateY(-50%);
    border-radius: 8px;
    background: #1f1f1f;
    border: 1px solid var(--border-color);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
    font-size: var(--small-font-size);
    color: var(--body-color);
    animation: rail-notice-in 0.15s ease-out;
  }

  .rail__notice-title {
    font-family: var(--font-display);
    font-size: var(--hint-font-size);
    font-weight: 600;
    color: var(--muted-color);
  }

  @keyframes rail-notice-in {
    from {
      opacity: 0;
      translate: -4px 0;
    }
  }
</style>
