<script lang="ts">
  import ActivityCard from "@/components/activity/activity-card.svelte";
  import { resolveVisibleActivity, type UserActivity } from "@/services/activity-providers";
  import type { UserProfile } from "@/services/profile-api";
  import StatusDot from "./status-dot.svelte";

  let {
    profile = null,
    status = undefined,
    activity = undefined,
    showElapsed = undefined,
    loading = false,
    isSelf = false,
    animate = true,
    editableAvatar = false,
    onAvatarClick,
    onMessage,
    onAddFriend,
    onEditProfile,
    onBlock,
    onReport,
    onCopyId,
  }: {
    profile?: UserProfile | null;
    status?: import("@/constants/presence").PresenceStatus;
    /** Atividade já filtrada (ex.: vinda do hook usePresence). Se omitida, filtra a partir do profile. */
    activity?: UserActivity | null;
    showElapsed?: boolean;
    loading?: boolean;
    isSelf?: boolean;
    animate?: boolean;
    editableAvatar?: boolean;
    onAvatarClick?: () => void;
    onMessage?: (profile: UserProfile) => void;
    onAddFriend?: (profile: UserProfile) => void;
    onEditProfile?: () => void;
    onBlock?: (profile: UserProfile) => void;
    onReport?: (profile: UserProfile) => void;
    onCopyId?: (profile: UserProfile) => void;
  } = $props();

  let menuOpen = $state(false);
  let menuWrapEl = $state<HTMLElement>();
  let feedback = $state("");
  let reducedMotion = $state(false);

  function onWindowPointerDown(event: PointerEvent) {
    if (menuOpen && !menuWrapEl?.contains(event.target as Node)) {
      menuOpen = false;
    }
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mq.matches;
    const listener = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  });

  const hasCustomAccent = $derived(Boolean(profile?.accentColor));
  const accent = $derived(profile?.accentColor || "#8b5cf6");
  const effectiveStatus = $derived(status ?? profile?.status ?? "online");
  const visibleActivity = $derived(
    activity !== undefined
      ? activity
      : profile
        ? resolveVisibleActivity(effectiveStatus, profile.activity, profile.activityPrivacy)
        : null,
  );
  const effectiveShowElapsed = $derived(showElapsed ?? profile?.activityPrivacy?.showElapsed ?? true);

  // Só anima o GIF no card aberto e respeitando prefers-reduced-motion
  const shouldAnimate = $derived(animate && !reducedMotion);

  const bannerImageSrc = $derived.by(() => {
    if (!profile || profile.banner.type === "color" || !profile.banner.url) return "";
    if (profile.banner.type === "gif" && !shouldAnimate) {
      return profile.banner.staticFallbackUrl || profile.banner.url;
    }
    return profile.banner.url;
  });

  const avatarSrc = $derived.by(() => {
    if (!profile?.avatar) return "";
    const isGifAvatar = profile.avatar.startsWith("data:image/gif") || /\.gif($|\?)/i.test(profile.avatar);
    if (isGifAvatar && !shouldAnimate && profile.avatarStaticFallback) {
      return profile.avatarStaticFallback;
    }
    return profile.avatar;
  });

  const bannerTransform = $derived.by(() => {
    const crop = profile?.banner.crop;
    if (!crop) return "";
    return `translate(${crop.x}%, ${crop.y}%) scale(${crop.zoom})`;
  });

  const memberSince = $derived.by(() => {
    if (!profile?.createdAt) return "";
    const date = new Date(profile.createdAt);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  });

  const initials = $derived(profile ? (profile.displayName || profile.username).slice(0, 1).toUpperCase() : "?");

  function flash(text: string) {
    feedback = text;
    window.setTimeout(() => {
      if (feedback === text) feedback = "";
    }, 2400);
  }

  function handleCopyId() {
    if (!profile) return;
    navigator.clipboard?.writeText(profile.id).catch(() => undefined);
    onCopyId?.(profile);
    menuOpen = false;
    flash("ID copiado!");
  }

  function handleBlock() {
    if (!profile) return;
    onBlock?.(profile);
    menuOpen = false;
    flash(`${profile.displayName} bloqueado.`);
  }

  function handleReport() {
    if (!profile) return;
    onReport?.(profile);
    menuOpen = false;
    flash("Denúncia enviada para análise.");
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="profile-card-frame" class:profile-card-frame--accent={hasCustomAccent} style:--card-accent={accent}>
  <article class="profile-card" aria-busy={loading}>
    {#if loading || !profile}
      <!-- Skeleton de carregamento -->
      <div class="profile-card__banner profile-card__skeleton"></div>
      <div class="profile-card__body">
        <div class="profile-card__avatar-wrap">
          <div class="profile-card__avatar profile-card__skeleton"></div>
        </div>
        <div class="profile-card__sk-line profile-card__sk-line--lg profile-card__skeleton"></div>
        <div class="profile-card__sk-line profile-card__sk-line--sm profile-card__skeleton"></div>
        <div class="profile-card__divider"></div>
        <div class="profile-card__sk-line profile-card__skeleton"></div>
        <div class="profile-card__sk-line profile-card__sk-line--md profile-card__skeleton"></div>
      </div>
    {:else}
      <!-- 1. Banner no topo (110px) -->
      <div class="profile-card__banner" style:background={profile.banner.color || "#1e1b4b"}>
        {#if bannerImageSrc}
          <img
            class="profile-card__banner-img"
            src={bannerImageSrc}
            alt=""
            loading="lazy"
            draggable="false"
            style:transform={bannerTransform}
          />
        {/if}
        {#if profile.banner.type === "gif" && shouldAnimate}
          <span class="profile-card__gif-tag">GIF</span>
        {/if}
      </div>

      <div class="profile-card__body" class:profile-card__body--accent={hasCustomAccent}>
        <!-- 2. Avatar 80px sobreposto à borda inferior do banner + indicador de status -->
        <div class="profile-card__avatar-wrap">
          {#if editableAvatar}
            <button
              type="button"
              class="profile-card__avatar profile-card__avatar--editable"
              style:background={accent}
              aria-label="Alterar foto de perfil"
              onclick={() => onAvatarClick?.()}
            >
              {#if avatarSrc}
                <img class="profile-card__avatar-img" src={avatarSrc} alt={profile.displayName} loading="lazy" />
              {:else}
                <span class="profile-card__initials">{initials}</span>
              {/if}
              <span class="profile-card__avatar-overlay" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Alterar</span>
              </span>
            </button>
          {:else}
            <div class="profile-card__avatar" style:background={accent}>
              {#if avatarSrc}
                <img class="profile-card__avatar-img" src={avatarSrc} alt={profile.displayName} loading="lazy" />
              {:else}
                <span class="profile-card__initials">{initials}</span>
              {/if}
            </div>
          {/if}
          <span class="profile-card__status-pos">
            <StatusDot
              status={effectiveStatus}
              size="large"
              ringColor="#111118"
              labelOverride={!isSelf && effectiveStatus === "invisible" ? "Offline" : ""}
            />
          </span>
        </div>

        <!-- 3. Nome de exibição em negrito + @usuario em cinza -->
        <div class="profile-card__identity">
          <h2 class="profile-card__display-name">{profile.displayName}</h2>
          <span class="profile-card__username">@{profile.username}</span>
        </div>

        <!-- 4. Atividade ("Jogando agora" / "Ouvindo" / "Assistindo") -->
        {#if visibleActivity}
          <ActivityCard activity={visibleActivity} accentColor={accent} showElapsed={effectiveShowElapsed} />
        {/if}

        <!-- 5. Divisor sutil -->
        <hr class="profile-card__divider" />

        <!-- 6. Descrição -->
        <section class="profile-card__section">
          <h3 class="profile-card__section-title">Descrição</h3>
          <p class="profile-card__description">
            {profile.description || "Este usuário ainda não adicionou uma descrição no Ludra."}
          </p>
        </section>

        <!-- 7. No Ludra desde -->
        <section class="profile-card__section">
          <h3 class="profile-card__section-title">No Ludra desde</h3>
          <p class="profile-card__meta">{memberSince}</p>
        </section>

        <!-- 8. Grupos em comum -->
        {#if profile.mutualGroups.length > 0}
          <section class="profile-card__section">
            <h3 class="profile-card__section-title">
              Grupos em comum ({profile.mutualGroups.length})
            </h3>
            <ul class="profile-card__groups">
              {#each profile.mutualGroups as group (group.id)}
                <li class="profile-card__group-pill" title={group.name}>
                  <span class="profile-card__group-avatar" style:background={group.color}>{group.initials}</span>
                  <span class="profile-card__group-name">{group.name}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if feedback}
          <p class="profile-card__feedback" role="status">{feedback}</p>
        {/if}

        <!-- 9 / 10. Rodapé com botões -->
        <footer class="profile-card__footer">
          {#if isSelf}
            <button
              type="button"
              class="profile-card__btn profile-card__btn--primary"
              onclick={() => onEditProfile?.()}
            >
              Editar perfil
            </button>
          {:else}
            <button
              type="button"
              class="profile-card__btn profile-card__btn--primary"
              onclick={() => onMessage?.(profile)}
            >
              Enviar mensagem
            </button>
            <button
              type="button"
              class="profile-card__btn profile-card__btn--outline"
              onclick={() => {
                onAddFriend?.(profile);
                flash(`Pedido enviado para @${profile.username}!`);
              }}
            >
              Adicionar amigo
            </button>
            <div class="profile-card__more-wrap" bind:this={menuWrapEl}>
              <button
                type="button"
                class="profile-card__btn profile-card__btn--icon"
                aria-label="Mais opções"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onclick={() => (menuOpen = !menuOpen)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
              {#if menuOpen}
                <div class="profile-card__menu" role="menu">
                  <button type="button" role="menuitem" class="profile-card__menu-item" onclick={handleCopyId}>
                    Copiar ID
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class="profile-card__menu-item profile-card__menu-item--danger"
                    onclick={handleReport}
                  >
                    Denunciar
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class="profile-card__menu-item profile-card__menu-item--danger"
                    onclick={handleBlock}
                  >
                    Bloquear
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </footer>
      </div>
    {/if}
  </article>
</div>

<style>
  .profile-card-frame {
    width: 340px;
    max-width: 100%;
    padding: 1.5px;
    border-radius: 17px;
    background: rgba(139, 92, 246, 0.35);
    box-shadow:
      0 22px 54px rgba(0, 0, 0, 0.8),
      0 0 28px rgba(139, 92, 246, 0.16);
  }

  .profile-card-frame--accent {
    background: linear-gradient(135deg, var(--card-accent, #8b5cf6), #c084fc 52%, #38bdf8);
    box-shadow:
      0 24px 56px rgba(0, 0, 0, 0.85),
      0 0 32px color-mix(in srgb, var(--card-accent, #8b5cf6) 35%, transparent);
  }

  .profile-card {
    width: 100%;
    border-radius: 16px;
    background: #111118;
    color: #ffffff;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .profile-card__banner {
    position: relative;
    width: 100%;
    height: 110px;
    overflow: hidden;
    flex: none;
  }

  .profile-card__banner-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transform-origin: center;
  }

  .profile-card__gif-tag {
    position: absolute;
    top: 8px;
    right: 10px;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(11, 11, 15, 0.72);
    border: 1px solid rgba(139, 92, 246, 0.45);
    color: #e9d5ff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .profile-card__body {
    position: relative;
    padding: 0 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .profile-card__body--accent {
    background: linear-gradient(180deg, color-mix(in srgb, var(--card-accent, #8b5cf6) 11%, #111118) 0%, #111118 46%);
  }

  .profile-card__avatar-wrap {
    position: relative;
    width: 80px;
    height: 80px;
    margin-top: -40px;
    flex: none;
  }

  .profile-card__avatar {
    position: relative;
    width: 80px;
    height: 80px;
    padding: 0;
    border-radius: 50%;
    border: 5px solid #111118;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: #8b5cf6;
  }

  .profile-card__avatar--editable {
    cursor: pointer;
  }

  .profile-card__avatar-overlay {
    position: absolute;
    inset: 0;
    background: rgba(11, 11, 15, 0.72);
    color: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0;
    transition: opacity 150ms ease;
  }

  .profile-card__avatar-overlay svg {
    width: 18px;
    height: 18px;
  }

  .profile-card__avatar--editable:hover .profile-card__avatar-overlay,
  .profile-card__avatar--editable:focus-visible .profile-card__avatar-overlay {
    opacity: 1;
  }

  .profile-card__avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .profile-card__initials {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    color: #ffffff;
  }

  .profile-card__status-pos {
    position: absolute;
    right: 0;
    bottom: 0;
    display: flex;
  }

  .profile-card__identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profile-card__display-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.2;
  }

  .profile-card__username {
    font-size: 13px;
    color: #9ca3af;
  }

  .profile-card__divider {
    width: 100%;
    height: 1px;
    margin: 2px 0;
    border: 0;
    background: rgba(255, 255, 255, 0.08);
  }

  .profile-card__section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .profile-card__section-title {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
  }

  .profile-card__description,
  .profile-card__meta {
    margin: 0;
    font-size: 13px;
    color: #e5e7eb;
    line-height: 1.45;
    word-break: break-word;
  }

  .profile-card__groups {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .profile-card__group-pill {
    max-width: 100%;
    padding: 3px 8px 3px 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.07);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .profile-card__group-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 9px;
    font-weight: 700;
    color: #ffffff;
    flex: none;
  }

  .profile-card__group-name {
    font-size: 11px;
    color: #d1d5db;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .profile-card__feedback {
    margin: 0;
    font-size: 12px;
    color: #a78bfa;
  }

  .profile-card__footer {
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .profile-card__btn {
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background 150ms ease,
      box-shadow 150ms ease,
      border-color 150ms ease;
  }

  .profile-card__btn--primary {
    flex: 1;
    background: #111118;
    border: 1px solid var(--card-accent, #8b5cf6);
    color: #ffffff;
  }

  .profile-card__btn--primary:hover {
    background: color-mix(in srgb, var(--card-accent, #8b5cf6) 22%, #111118);
    box-shadow: 0 0 14px color-mix(in srgb, var(--card-accent, #8b5cf6) 45%, transparent);
  }

  .profile-card__btn--outline {
    flex: 1;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(139, 92, 246, 0.45);
    color: #e5e7eb;
  }

  .profile-card__btn--outline:hover {
    background: rgba(139, 92, 246, 0.14);
    border-color: #8b5cf6;
    color: #ffffff;
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.3);
  }

  .profile-card__more-wrap {
    position: relative;
  }

  .profile-card__btn--icon {
    width: 36px;
    padding: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #9ca3af;
  }

  .profile-card__btn--icon:hover {
    color: #ffffff;
    border-color: rgba(139, 92, 246, 0.55);
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.25);
  }

  .profile-card__btn--icon svg {
    width: 16px;
    height: 16px;
  }

  .profile-card__menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 10;
    min-width: 140px;
    padding: 4px;
    border-radius: 10px;
    background: #181824;
    border: 1px solid rgba(139, 92, 246, 0.35);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profile-card__menu-item {
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #e5e7eb;
    font-size: 12px;
    font-weight: 500;
    text-align: left;
  }

  .profile-card__menu-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .profile-card__menu-item--danger {
    color: #f87171;
  }

  .profile-card__menu-item--danger:hover {
    background: rgba(239, 68, 68, 0.14);
  }

  /* Skeleton shimmer */
  .profile-card__skeleton {
    background: linear-gradient(90deg, #181824 25%, #232336 50%, #181824 75%);
    background-size: 200% 100%;
    animation: profile-shimmer 1.2s infinite;
  }

  .profile-card__sk-line {
    height: 12px;
    border-radius: 6px;
    width: 100%;
  }

  .profile-card__sk-line--lg {
    height: 20px;
    width: 55%;
  }

  .profile-card__sk-line--md {
    width: 75%;
  }

  .profile-card__sk-line--sm {
    width: 35%;
  }

  @keyframes profile-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
