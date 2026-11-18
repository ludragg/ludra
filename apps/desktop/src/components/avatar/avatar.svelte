<script lang="ts">
  import { Presence, type User } from "@/protocol/ludra/v1/models_pb";
  import { avatarUrl } from "@/services/server";

  type Person = Pick<User, "id" | "username" | "avatar">;

  let {
    user,
    size = "medium",
    presence,
  }: {
    user: Person;
    size?: "small" | "medium" | "large" | "huge" | "group" | "call" | "ringing" | "fill";
    /** Quando informado, desenha o indicador de status no canto do avatar. */
    presence?: Presence;
  } = $props();

  let failed = $state<string | null>(null);

  const tone = $derived(parseInt(user.id.slice(-8), 16) % 6);
  const initial = $derived(user.username.charAt(0).toUpperCase());
  const source = $derived(user.avatar && failed !== user.avatar ? avatarUrl(user.id, user.avatar) : null);

  const dot = $derived(
    presence === Presence.ONLINE
      ? "online"
      : presence === Presence.BUSY
        ? "busy"
        : presence === Presence.INVISIBLE
          ? "invisible"
          : "offline",
  );
</script>

{#snippet face()}
  {#if source}
    <img class="avatar avatar--{size}" src={source} alt="" onerror={() => (failed = user.avatar)} />
  {:else}
    <span class="avatar avatar--{size} avatar--tone-{tone}" aria-hidden="true">{initial}</span>
  {/if}
{/snippet}

{#if presence === undefined}
  {@render face()}
{:else}
  <span class="avatar-status avatar-status--{size}">
    {@render face()}
    <span class="avatar-status__dot avatar-status__dot--{dot}" aria-hidden="true"></span>
  </span>
{/if}

<style>
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--dark-background-color);
    font-weight: 600;
    object-fit: cover;
  }

  .avatar--small {
    width: 32px;
    height: 32px;
    font-size: var(--hint-font-size);
  }

  .avatar--medium {
    width: 36px;
    height: 36px;
  }

  .avatar--large {
    width: 40px;
    height: 40px;
  }

  .avatar--huge {
    width: 72px;
    height: 72px;
    font-size: 26px;
  }

  .avatar--ringing {
    width: 88px;
    height: 88px;
    font-size: 32px;
  }

  .avatar--fill {
    width: 100%;
    height: 100%;
    font-size: calc(var(--size, 80px) * 0.36);
  }

  .avatar-status {
    position: relative;
    flex: none;
    display: flex;
  }

  /* O anel acompanha o fundo de quem usa o avatar (hover/ativo) via --avatar-ring. */
  .avatar-status__dot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--subtle-color);
    box-shadow: 0 0 0 2px var(--avatar-ring, var(--dark-background-color));
    transition: box-shadow ease 0.1s;
  }

  .avatar-status--small .avatar-status__dot {
    width: 10px;
    height: 10px;
    right: -3px;
    bottom: -3px;
  }

  .avatar-status__dot--online {
    background: var(--success-color);
  }

  .avatar-status__dot--busy {
    background: #f6746b;
  }

  .avatar-status__dot--invisible {
    background: var(--avatar-ring, var(--dark-background-color));
    border: 2px solid var(--subtle-color);
  }

  .avatar--tone-0 {
    background: #16b195;
  }

  .avatar--tone-1 {
    background: #3e62c0;
    color: #ffffff;
  }

  .avatar--tone-2 {
    background: #f6746b;
  }

  .avatar--tone-3 {
    background: #d08a52;
  }

  .avatar--tone-4 {
    background: #30edc5;
  }

  .avatar--tone-5 {
    background: #f3c611;
  }
</style>
