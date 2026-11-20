<script lang="ts">
  import { tick } from "svelte";
  import type { UserProfile } from "@/services/profile-api";
  import { chat } from "@/stores/chat.svelte";
  import { usePresence } from "@/stores/presence.svelte";
  import { profileStore, useProfile } from "@/stores/profile.svelte";
  import ProfileCard from "./profile-card.svelte";

  const profileState = useProfile(
    () => profileStore.modalUserId,
    () => profileStore.modalFallbackName,
  );
  const presence = usePresence(() => profileStore.modalUserId);

  let dialogEl = $state<HTMLElement>();
  let previouslyFocused: HTMLElement | null = null;

  const isSelf = $derived(Boolean(profileStore.modalUserId && profileStore.modalUserId === chat.user?.id));

  $effect(() => {
    if (!profileStore.modalUserId) return;
    previouslyFocused = document.activeElement as HTMLElement | null;
    void tick().then(() => {
      const focusables = getFocusable();
      focusables[0]?.focus();
    });
    return () => {
      previouslyFocused?.focus?.();
    };
  });

  function getFocusable(): HTMLElement[] {
    if (!dialogEl) return [];
    return Array.from(
      dialogEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  function onkeydown(event: KeyboardEvent) {
    if (!profileStore.modalUserId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      profileStore.closeModal();
      return;
    }
    // Focus trap dentro do modal
    if (event.key === "Tab") {
      const focusables = getFocusable();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleEditProfile() {
    profileStore.closeModal();
    profileStore.pendingSettingsTab = "profile";
    chat.showSettings();
  }

  function handleMessage(profile: UserProfile) {
    profileStore.closeModal();
    chat.start(profile.username).catch(() => undefined);
  }

  function handleAddFriend(profile: UserProfile) {
    chat.addFriend(profile.username).catch(() => undefined);
  }

  function handleBlock(profile: UserProfile) {
    chat.block(profile.id).catch(() => undefined);
  }
</script>

<svelte:window {onkeydown} />

{#if profileStore.modalUserId}
  <div
    class="profile-modal-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) profileStore.closeModal();
    }}
  >
    <div
      class="profile-modal"
      bind:this={dialogEl}
      role="dialog"
      aria-modal="true"
      aria-label={profileState.profile ? `Perfil de ${profileState.profile.displayName}` : "Carregando perfil"}
    >
      <button
        type="button"
        class="profile-modal__close"
        aria-label="Fechar perfil"
        onclick={() => profileStore.closeModal()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <ProfileCard
        profile={profileState.profile}
        status={presence.status}
        activity={presence.activity}
        showElapsed={presence.showElapsed}
        loading={profileState.loading && !profileState.profile}
        {isSelf}
        animate={true}
        onEditProfile={handleEditProfile}
        onMessage={handleMessage}
        onAddFriend={handleAddFriend}
        onBlock={handleBlock}
      />
    </div>
  </div>
{/if}

<style>
  .profile-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(6, 6, 10, 0.72);
    backdrop-filter: blur(4px);
    animation: modal-fade 180ms ease-out;
  }

  .profile-modal {
    position: relative;
    max-width: 100%;
    animation: modal-scale 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .profile-modal__close {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 5;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(11, 11, 15, 0.75);
    color: #e5e7eb;
    display: grid;
    place-items: center;
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .profile-modal__close:hover {
    background: rgba(139, 92, 246, 0.45);
    color: #ffffff;
  }

  .profile-modal__close svg {
    width: 14px;
    height: 14px;
  }

  @keyframes modal-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes modal-scale {
    from {
      opacity: 0;
      transform: scale(0.94);
    }
  }

  /* Em telas pequenas, abre como bottom sheet */
  @media (max-width: 640px) {
    .profile-modal-backdrop {
      padding: 0;
      align-items: flex-end;
    }

    .profile-modal {
      width: 100%;
      animation: modal-sheet 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .profile-modal :global(.profile-card-frame) {
      width: 100%;
      border-radius: 20px 20px 0 0;
      padding-bottom: 0;
    }

    .profile-modal :global(.profile-card) {
      border-radius: 19px 19px 0 0;
    }

    @keyframes modal-sheet {
      from {
        opacity: 0;
        transform: translateY(36px);
      }
    }
  }
</style>
