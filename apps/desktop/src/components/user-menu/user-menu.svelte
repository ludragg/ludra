<script lang="ts">
  import { t } from "@/i18n";
  import { FriendState, type User } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  type Person = Pick<User, "id" | "username">;
  type Item = {
    id: string;
    label: string;
    icon: string[];
    tone?: "danger" | "owner";
    run: () => Promise<unknown> | void;
  };

  let {
    user,
    x,
    y,
    ontransfer,
    onclose,
  }: { user: Person; x: number; y: number; ontransfer?: () => void; onclose: () => void } = $props();

  let menu = $state<HTMLElement>();
  let confirming = $state<"transfer" | "block" | null>(null);

  const blockIcon = ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M4.93 4.93l14.14 14.14"];
  const relation = $derived(chat.friends.find((friend) => friend.user?.id === user.id)?.state ?? null);
  const blocked = $derived(chat.isBlocked(user.id));

  const items = $derived.by(() => {
    const list: Item[] = [];
    if (ontransfer) {
      list.push({
        id: "transfer",
        label: confirming === "transfer" ? t("group.confirmTransfer") : t("group.transfer"),
        icon: ["M2 18h20l-2-11-5 4-3-7-3 7-5-4z"],
        tone: "owner",
        run: transfer,
      });
    }
    if (relation === FriendState.ACCEPTED) {
      list.push({
        id: "remove",
        label: t("userMenu.removeFriend"),
        icon: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M17 11h6"],
        run: () => chat.removeFriend(user.id),
      });
    } else if (relation === FriendState.INCOMING) {
      list.push({
        id: "accept",
        label: t("userMenu.acceptFriend"),
        icon: ["M5 12l5 5L20 7"],
        run: () => chat.acceptFriend(user.id),
      });
    } else if (relation === FriendState.OUTGOING) {
      list.push({
        id: "cancel",
        label: t("userMenu.cancelRequest"),
        icon: ["M6 6l12 12M18 6L6 18"],
        run: () => chat.removeFriend(user.id),
      });
    } else if (!blocked) {
      list.push({
        id: "add",
        label: t("userMenu.addFriend"),
        icon: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M19 8v6M22 11h-6"],
        run: () => chat.addFriend(user.username),
      });
    }
    list.push({
      id: "block",
      label: blocked ? t("friends.unblock") : confirming === "block" ? t("group.confirmBlock") : t("group.block"),
      icon: blockIcon,
      tone: "danger",
      run: () => (blocked ? chat.unblock(user.id) : chat.block(user.id)),
    });
    return list;
  });

  const width = 210;
  const left = $derived(Math.min(x, window.innerWidth - width - 8));
  const top = $derived(Math.min(y, window.innerHeight - items.length * 36 - 20));

  function transfer() {
    ontransfer?.();
  }

  function choose(item: Item) {
    const needsConfirm = item.id === "transfer" || (item.id === "block" && !blocked);
    if (needsConfirm && confirming !== item.id) {
      confirming = item.id as "transfer" | "block";
      return;
    }
    Promise.resolve(item.run()).catch(() => undefined);
    onclose();
  }

  function onpointerdown(event: PointerEvent) {
    if (!menu?.contains(event.target as Node)) {
      onclose();
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onclose();
    }
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

<div
  class="user-menu"
  role="menu"
  aria-label={user.username}
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  bind:this={menu}
>
  {#each items as item, index (item.id)}
    <button
      class="user-menu__item user-menu__item--{item.tone ?? 'default'}"
      role="menuitem"
      onclick={() => choose(item)}
      {@attach (button) => {
        if (index === 0) {
          button.focus();
        }
      }}
    >
      <svg
        class="user-menu__icon"
        viewBox="0 0 24 24"
        fill={item.tone === "owner" ? "currentColor" : "none"}
        stroke={item.tone === "owner" ? "none" : "currentColor"}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {#each item.icon as path (path)}
          <path d={path} />
        {/each}
      </svg>
      {item.label}
    </button>
  {/each}
</div>

<style>
  .user-menu {
    position: fixed;
    z-index: 20;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .user-menu__item {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-color);
    font-size: var(--hint-font-size);
    text-align: left;
    transition: background ease 0.1s;
  }

  .user-menu__item:hover,
  .user-menu__item:focus-visible {
    background: var(--hover-color);
  }

  .user-menu__item--danger {
    color: #f6746b;
  }

  .user-menu__item--owner .user-menu__icon {
    color: #f3c611;
  }

  .user-menu__icon {
    width: 14px;
    flex: none;
  }
</style>
