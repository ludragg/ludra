<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { Checkbox } from "@/components";
  import { PRESENCE_ORDER, PRESENCE_STATUSES } from "@/constants/presence";
  import { resolveVisibleActivity, type ActivityPrivacy } from "@/services/activity-providers";
  import {
    DESCRIPTION_MAX_LENGTH,
    clonePlain,
    cropStaticAvatarToDataUrl,
    extractStaticFirstFrame,
    fileToDataUrl,
    validateAvatarFile,
    type ProfileBanner,
    type ProfileStatus,
    type UserProfile,
  } from "@/services/profile-api";
  import { chat } from "@/stores/chat.svelte";
  import { usePresence } from "@/stores/presence.svelte";
  import { profileStore, useProfile } from "@/stores/profile.svelte";
  import BannerUploader from "./banner-uploader.svelte";
  import ProfileCard from "./profile-card.svelte";
  import StatusDot from "./status-dot.svelte";

  const userId = $derived(chat.user?.id ?? "local-preview");
  const me = useProfile(
    () => userId,
    () => chat.user?.username ?? "usuario",
  );
  const myPresence = usePresence(() => userId);

  const accentPresets = ["#8b5cf6", "#a855f7", "#ec4899", "#38bdf8", "#22c55e", "#f59e0b", "#ef4444"];

  // Estado editável do formulário
  let displayName = $state("");
  let description = $state("");
  let accentColor = $state("#8b5cf6");
  let status = $state<ProfileStatus>("online");
  let activityPrivacy = $state<ActivityPrivacy>({ showActivity: true, showElapsed: true });
  let avatarPreview = $state("");
  let avatarStaticFallback = $state<string | undefined>(undefined);
  let pendingAvatarFile = $state<File | null>(null);
  let pendingAvatarIsGif = $state(false);
  let banner = $state<ProfileBanner>({ url: "", type: "color", color: "#2e1065" });

  // Estado do modal de recorte circular 1:1
  let cropModal = $state<{
    objectUrl: string;
    file: File;
    isGif: boolean;
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  let cropDragging = $state(false);
  let cropDragStart = { x: 0, y: 0, startX: 0, startY: 0 };
  let cropDialogEl = $state<HTMLElement>();
  let cropPrevFocus: HTMLElement | null = null;

  $effect(() => {
    if (!cropModal) return;
    cropPrevFocus = document.activeElement as HTMLElement | null;
    void tick().then(() => {
      cropDialogEl?.querySelector<HTMLElement>("button, input")?.focus();
    });
    return () => {
      cropPrevFocus?.focus?.();
    };
  });

  function onCropKeydown(event: KeyboardEvent) {
    if (!cropModal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCrop();
      return;
    }
    if (event.key === "Tab" && cropDialogEl) {
      const focusables = Array.from(
        cropDialogEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
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

  let initializedFor = $state<string | null>(null);
  let avatarInput = $state<HTMLInputElement>();
  let avatarError = $state("");
  let saving = $state(false);
  let toast = $state<{ type: "success" | "error"; text: string } | null>(null);
  let toastTimer: number | undefined;

  // Rastreia object URLs criadas para revogar sem vazar memória
  let activePreviewObjectUrl: string | null = null;

  function revokePreviewUrl() {
    if (activePreviewObjectUrl) {
      URL.revokeObjectURL(activePreviewObjectUrl);
      activePreviewObjectUrl = null;
    }
  }

  function revokeCropUrl() {
    if (cropModal?.objectUrl) {
      URL.revokeObjectURL(cropModal.objectUrl);
    }
  }

  onDestroy(() => {
    revokePreviewUrl();
    revokeCropUrl();
    window.clearTimeout(toastTimer);
    profileStore.hasUnsavedChanges = false;
  });

  function showToast(type: "success" | "error", text: string) {
    window.clearTimeout(toastTimer);
    toast = { type, text };
    toastTimer = window.setTimeout(() => (toast = null), 3500);
  }

  function hydrateFromProfile(p: UserProfile) {
    revokePreviewUrl();
    displayName = p.displayName;
    description = p.description;
    accentColor = p.accentColor;
    status = p.status;
    activityPrivacy = clonePlain(p.activityPrivacy ?? { showActivity: true, showElapsed: true });
    avatarPreview = p.avatar;
    avatarStaticFallback = p.avatarStaticFallback;
    pendingAvatarFile = null;
    pendingAvatarIsGif = false;
    banner = clonePlain(p.banner);
    avatarError = "";
  }

  // Sincroniza estado local quando o perfil carrega pela primeira vez
  $effect(() => {
    const p = me.profile;
    if (!p || initializedFor === p.id) return;
    initializedFor = p.id;
    hydrateFromProfile(p);
  });

  // Se o status mudar pelo menu da sidebar ou pelo ausente automático, reflete no editor quando não há edição pendente
  $effect(() => {
    const p = me.profile;
    if (!p || initializedFor !== p.id) return;
    if (!isDirty && status !== p.status) {
      status = p.status;
    }
  });

  // Detecta se há alterações pendentes comparando o formulário com o perfil salvo
  const isDirty = $derived.by(() => {
    const saved = me.profile;
    if (!saved) return false;
    if (pendingAvatarFile !== null) return true;
    return (
      displayName.trim() !== saved.displayName ||
      description !== saved.description ||
      accentColor !== saved.accentColor ||
      status !== saved.status ||
      JSON.stringify(activityPrivacy) !== JSON.stringify(saved.activityPrivacy) ||
      avatarPreview !== saved.avatar ||
      JSON.stringify(banner) !== JSON.stringify(saved.banner)
    );
  });

  $effect(() => {
    profileStore.hasUnsavedChanges = isDirty;
  });

  // Aviso ao tentar fechar/recarregar a página com alterações não salvas
  $effect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

  // Preview ao vivo do card enquanto o usuário edita (atividade vem do usePresence)
  const livePreview = $derived<UserProfile>({
    id: userId,
    username: me.profile?.username ?? chat.user?.username ?? "usuario",
    displayName: displayName.trim() || me.profile?.username || "Usuário",
    avatar: avatarPreview,
    avatarStaticFallback,
    banner,
    accentColor,
    description,
    status,
    activity: myPresence.activity,
    activityPrivacy,
    createdAt: me.profile?.createdAt ?? new Date().toISOString(),
    mutualGroups: me.profile?.mutualGroups ?? [],
  });

  const liveVisibleActivity = $derived(resolveVisibleActivity(status, myPresence.activity, activityPrivacy));

  function triggerAvatarPicker() {
    avatarInput?.click();
  }

  function onAvatarPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    avatarError = "";
    const validation = validateAvatarFile(file);
    if (!validation.ok) {
      avatarError = validation.message;
      showToast("error", validation.message);
      return;
    }

    revokeCropUrl();
    const objectUrl = URL.createObjectURL(file);
    cropModal = {
      objectUrl,
      file,
      isGif: validation.kind === "gif",
      x: 0,
      y: 0,
      zoom: 1,
    };
  }

  function startCropDrag(event: PointerEvent) {
    if (!cropModal || cropModal.isGif) return;
    cropDragging = true;
    cropDragStart = {
      x: event.clientX,
      y: event.clientY,
      startX: cropModal.x,
      startY: cropModal.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onCropDrag(event: PointerEvent) {
    if (!cropDragging || !cropModal) return;
    const dx = ((event.clientX - cropDragStart.x) / 2.2) * 0.8;
    const dy = ((event.clientY - cropDragStart.y) / 2.2) * 0.8;
    cropModal.x = Math.max(-50, Math.min(50, cropDragStart.startX + dx));
    cropModal.y = Math.max(-50, Math.min(50, cropDragStart.startY + dy));
  }

  function endCropDrag() {
    cropDragging = false;
  }

  function cancelCrop() {
    revokeCropUrl();
    cropModal = null;
  }

  async function confirmCrop() {
    if (!cropModal) return;
    const { objectUrl, file, isGif, x, y, zoom } = cropModal;

    try {
      if (isGif) {
        // Para GIF animado, não recortamos via canvas para não perder a animação
        revokePreviewUrl();
        activePreviewObjectUrl = objectUrl;
        avatarPreview = objectUrl;
        pendingAvatarFile = file;
        pendingAvatarIsGif = true;
        cropModal = null;
      } else {
        // Para imagens estáticas (PNG/JPG/WebP estático), aplicamos recorte circular 1:1
        const croppedDataUrl = await cropStaticAvatarToDataUrl(objectUrl, { x, y, zoom }, 256);
        URL.revokeObjectURL(objectUrl);
        revokePreviewUrl();
        avatarPreview = croppedDataUrl;
        avatarStaticFallback = croppedDataUrl;
        pendingAvatarFile = null;
        pendingAvatarIsGif = false;
        cropModal = null;
      }
    } catch (cause) {
      URL.revokeObjectURL(objectUrl);
      cropModal = null;
      const message = cause instanceof Error ? cause.message : "Erro ao processar a foto.";
      avatarError = message;
      showToast("error", message);
    }
  }

  function removeAvatar() {
    revokePreviewUrl();
    avatarPreview = "";
    avatarStaticFallback = undefined;
    pendingAvatarFile = null;
    pendingAvatarIsGif = false;
    avatarError = "";
  }

  function discardChanges() {
    if (!me.profile) return;
    hydrateFromProfile(me.profile);
    showToast("success", "Alterações descartadas.");
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!isDirty || saving) return;

    saving = true;
    avatarError = "";

    try {
      let finalAvatar = avatarPreview;
      let finalAvatarStatic = avatarStaticFallback;

      // TODO (Backend): Quando houver API, enviar o arquivo para POST /users/me/avatar (URL assinada)
      // em vez de converter para base64/dataURL e salvar no localStorage.
      if (pendingAvatarFile && pendingAvatarIsGif) {
        finalAvatar = await fileToDataUrl(pendingAvatarFile);
        finalAvatarStatic = await extractStaticFirstFrame(finalAvatar);
      }

      const saved = await profileStore.saveMe(userId, {
        displayName: displayName.trim() || livePreview.username,
        description: description.slice(0, DESCRIPTION_MAX_LENGTH),
        accentColor,
        status,
        activityPrivacy: clonePlain(activityPrivacy),
        avatar: finalAvatar,
        avatarStaticFallback: finalAvatarStatic,
        banner: clonePlain(banner),
      });

      // Atualiza o formulário com o valor persistido e libera eventuais Object URLs
      hydrateFromProfile(saved);
      showToast("success", "Perfil atualizado!");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar o perfil.";
      showToast("error", message);
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window onkeydown={onCropKeydown} />

<div class="profile-editor">
  <input
    bind:this={avatarInput}
    class="sr-only"
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif"
    onchange={onAvatarPick}
  />

  <form class="profile-editor__form" onsubmit={save}>
    <!-- Banner / GIF de fundo -->
    <div class="profile-editor__block">
      <BannerUploader {banner} onchange={(next) => (banner = next)} />
    </div>

    <!-- Nome de exibição -->
    <div class="profile-editor__block">
      <label class="profile-editor__label" for="pe-display-name">Nome de exibição</label>
      <input
        id="pe-display-name"
        class="profile-editor__input"
        type="text"
        maxlength="32"
        placeholder="Como você aparece no Ludra"
        bind:value={displayName}
      />
    </div>

    <!-- Status -->
    <div class="profile-editor__block">
      <span class="profile-editor__label">Status</span>
      <div class="profile-editor__statuses">
        {#each PRESENCE_ORDER as opt (opt)}
          <button
            type="button"
            class="profile-editor__status-chip"
            class:profile-editor__status-chip--active={status === opt}
            onclick={() => (status = opt)}
          >
            <StatusDot status={opt} size="small" bordered={false} ringColor="#111118" />
            <span>{PRESENCE_STATUSES[opt].label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Privacidade da atividade (detecção automática via app desktop / Steam) -->
    <div class="profile-editor__block">
      <span class="profile-editor__label">Privacidade da atividade</span>
      <div class="profile-editor__privacy-box">
        <Checkbox
          label="Mostrar minha atividade de jogo"
          checked={activityPrivacy.showActivity}
          onchange={(checked) => (activityPrivacy = { ...activityPrivacy, showActivity: checked })}
        />
        <Checkbox
          label="Mostrar tempo de jogo"
          checked={activityPrivacy.showElapsed}
          onchange={(checked) => (activityPrivacy = { ...activityPrivacy, showElapsed: checked })}
        />
        {#if status === "invisible"}
          <p class="profile-editor__activity-note">
            Como seu status está como Invisível, sua atividade nunca é exibida para outros usuários.
          </p>
        {/if}
      </div>
    </div>

    <!-- Descrição (até 190 caracteres) -->
    <div class="profile-editor__block">
      <div class="profile-editor__label-row">
        <label class="profile-editor__label" for="pe-description">Descrição</label>
        <span class="profile-editor__counter">{description.length}/{DESCRIPTION_MAX_LENGTH}</span>
      </div>
      <textarea
        id="pe-description"
        class="profile-editor__textarea"
        rows="3"
        maxlength={DESCRIPTION_MAX_LENGTH}
        placeholder="Escreva algo sobre você"
        bind:value={description}></textarea>
    </div>

    <!-- Cor de destaque do perfil -->
    <div class="profile-editor__block">
      <div class="profile-editor__label-row">
        <span class="profile-editor__label">Cor de destaque do perfil</span>
        {#if accentColor}
          <button type="button" class="profile-editor__clear-accent" onclick={() => (accentColor = "")}>
            Usar padrão
          </button>
        {/if}
      </div>
      <div class="profile-editor__swatches">
        {#each accentPresets as color (color)}
          <button
            type="button"
            class="profile-editor__swatch"
            class:profile-editor__swatch--active={accentColor === color}
            style:background={color}
            aria-label="Cor de destaque {color}"
            onclick={() => (accentColor = color)}
          ></button>
        {/each}
        <label class="profile-editor__color-picker" title="Cor personalizada">
          <input
            type="color"
            value={accentColor || "#8b5cf6"}
            oninput={(e) => (accentColor = (e.currentTarget as HTMLInputElement).value)}
          />
          <span>+</span>
        </label>
      </div>
    </div>

    <!-- Barra de ações: Salvar e Descartar -->
    <div class="profile-editor__submit-row">
      <button type="submit" class="profile-editor__btn profile-editor__btn--save" disabled={!isDirty || saving}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>
      {#if isDirty}
        <button
          type="button"
          class="profile-editor__btn profile-editor__btn--ghost"
          disabled={saving}
          onclick={discardChanges}
        >
          Descartar alterações
        </button>
      {/if}
    </div>
  </form>

  <!-- Preview ao vivo do card (avatar clicável com overlay de câmera) -->
  <aside class="profile-editor__preview" aria-label="Prévia do perfil">
    <span class="profile-editor__preview-title">Prévia ao vivo</span>
    <ProfileCard
      profile={livePreview}
      activity={liveVisibleActivity}
      showElapsed={activityPrivacy.showElapsed}
      isSelf={true}
      animate={true}
      editableAvatar={true}
      onAvatarClick={triggerAvatarPicker}
    />
    {#if avatarPreview}
      <button type="button" class="profile-editor__btn profile-editor__btn--ghost" onclick={removeAvatar}>
        Remover foto
      </button>
    {/if}
    {#if avatarError}
      <p class="profile-editor__error" role="alert">{avatarError}</p>
    {/if}
  </aside>
</div>

<!-- Modal de recorte circular 1:1 para avatar -->
{#if cropModal}
  <div
    class="avatar-crop-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) cancelCrop();
    }}
  >
    <div
      class="avatar-crop"
      bind:this={cropDialogEl}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
    >
      <h3 id="avatar-crop-title" class="avatar-crop__title">
        {cropModal.isGif ? "Prévia do avatar animado (GIF)" : "Recortar foto de perfil"}
      </h3>

      <div
        class="avatar-crop__stage"
        class:avatar-crop__stage--draggable={!cropModal.isGif}
        class:avatar-crop__stage--dragging={cropDragging}
        role="application"
        aria-label="Área de recorte circular do avatar"
        onpointerdown={startCropDrag}
        onpointermove={onCropDrag}
        onpointerup={endCropDrag}
        onpointercancel={endCropDrag}
      >
        <div class="avatar-crop__circle">
          <img
            class="avatar-crop__img"
            src={cropModal.objectUrl}
            alt="Prévia do avatar"
            draggable="false"
            style:transform={cropModal.isGif
              ? undefined
              : `translate(${cropModal.x}%, ${cropModal.y}%) scale(${cropModal.zoom})`}
          />
        </div>
      </div>

      {#if cropModal.isGif}
        <p class="avatar-crop__note">GIFs animados são centralizados automaticamente para preservar toda a animação.</p>
      {:else}
        <div class="avatar-crop__zoom">
          <label for="avatar-zoom-range">Zoom ({Math.round(cropModal.zoom * 100)}%)</label>
          <input id="avatar-zoom-range" type="range" min="1" max="2.5" step="0.05" bind:value={cropModal.zoom} />
        </div>
      {/if}

      <div class="avatar-crop__actions">
        <button type="button" class="profile-editor__btn profile-editor__btn--ghost" onclick={cancelCrop}>
          Cancelar
        </button>
        <button type="button" class="profile-editor__btn profile-editor__btn--save" onclick={confirmCrop}>
          Aplicar foto
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast de sucesso ou erro -->
{#if toast}
  <div class="profile-toast profile-toast--{toast.type}" role="status" aria-live="polite">
    {toast.text}
  </div>
{/if}

<style>
  .profile-editor {
    display: flex;
    align-items: flex-start;
    gap: 32px;
    flex-wrap: wrap;
  }

  .profile-editor__form {
    flex: 1 1 380px;
    max-width: 540px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .profile-editor__block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .profile-editor__label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .profile-editor__label {
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
  }

  .profile-editor__counter {
    font-size: 11px;
    color: #9ca3af;
  }

  .profile-editor__clear-accent {
    padding: 0;
    border: 0;
    background: transparent;
    color: #9ca3af;
    font-size: 11px;
  }

  .profile-editor__clear-accent:hover {
    color: #ffffff;
    text-decoration: underline;
  }

  .profile-editor__input,
  .profile-editor__textarea {
    width: 100%;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: #0b0b0f;
    color: #ffffff;
    font: inherit;
    font-size: 13px;
    outline: none;
    transition: border-color 150ms ease;
  }

  .profile-editor__input:focus,
  .profile-editor__textarea:focus {
    border-color: #8b5cf6;
  }

  .profile-editor__textarea {
    resize: vertical;
  }

  .profile-editor__statuses {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .profile-editor__status-chip {
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: #111118;
    color: #d1d5db;
    font-size: 12px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: all 150ms ease;
  }

  .profile-editor__status-chip:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .profile-editor__status-chip--active {
    border-color: #8b5cf6;
    background: rgba(139, 92, 246, 0.16);
    color: #ffffff;
  }

  .profile-editor__swatches {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .profile-editor__swatch {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid transparent;
    padding: 0;
  }

  .profile-editor__swatch--active {
    border-color: #ffffff;
    box-shadow: 0 0 0 2px #8b5cf6;
  }

  .profile-editor__color-picker {
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px dashed rgba(255, 255, 255, 0.35);
    display: grid;
    place-items: center;
    color: #d1d5db;
    cursor: pointer;
    overflow: hidden;
  }

  .profile-editor__color-picker input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .profile-editor__btn {
    height: 36px;
    padding: 0 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    transition:
      background 150ms ease,
      box-shadow 150ms ease,
      border-color 150ms ease,
      opacity 150ms ease;
  }

  .profile-editor__btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  .profile-editor__btn--save {
    background: #8b5cf6;
    border: 1px solid #a78bfa;
    color: #ffffff;
    box-shadow: 0 0 14px rgba(139, 92, 246, 0.35);
  }

  .profile-editor__btn--save:not(:disabled):hover {
    background: #7c3aed;
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.55);
  }

  .profile-editor__privacy-box {
    padding: 12px;
    border-radius: 12px;
    background: #111118;
    border: 1px solid rgba(139, 92, 246, 0.25);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .profile-editor__activity-note {
    margin: 0;
    font-size: 11px;
    color: #a78bfa;
  }

  .profile-editor__btn--ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #9ca3af;
  }

  .profile-editor__btn--ghost:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .profile-editor__submit-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding-top: 4px;
  }

  .profile-editor__error {
    margin: 0;
    font-size: 12px;
    color: #f87171;
  }

  .profile-editor__preview {
    position: sticky;
    top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .profile-editor__preview-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
  }

  /* Modal de recorte 1:1 do avatar */
  .avatar-crop-backdrop {
    position: fixed;
    inset: 0;
    z-index: 95;
    padding: 16px;
    display: grid;
    place-items: center;
    background: rgba(6, 6, 10, 0.78);
    backdrop-filter: blur(4px);
  }

  .avatar-crop {
    width: 100%;
    max-width: 360px;
    padding: 20px;
    border-radius: 16px;
    background: #111118;
    border: 1px solid rgba(139, 92, 246, 0.45);
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .avatar-crop__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
  }

  .avatar-crop__stage {
    width: 100%;
    height: 220px;
    border-radius: 12px;
    background: #0b0b0f;
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: grid;
    place-items: center;
    user-select: none;
  }

  .avatar-crop__stage--draggable {
    cursor: grab;
  }

  .avatar-crop__stage--dragging {
    cursor: grabbing;
  }

  .avatar-crop__circle {
    width: 176px;
    height: 176px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid #8b5cf6;
    box-shadow: 0 0 0 9999px rgba(11, 11, 15, 0.35);
  }

  .avatar-crop__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    transform-origin: center;
  }

  .avatar-crop__note {
    margin: 0;
    font-size: 12px;
    color: #9ca3af;
    text-align: center;
  }

  .avatar-crop__zoom {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: #9ca3af;
  }

  .avatar-crop__zoom input {
    flex: 1;
    accent-color: #8b5cf6;
  }

  .avatar-crop__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  /* Toast */
  .profile-toast {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 100;
    padding: 10px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
    animation: toast-in 160ms ease-out;
  }

  .profile-toast--success {
    background: #111118;
    border: 1px solid #8b5cf6;
    color: #ffffff;
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.65),
      0 0 18px rgba(139, 92, 246, 0.35);
  }

  .profile-toast--error {
    background: #1f1115;
    border: 1px solid #ef4444;
    color: #fecaca;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
