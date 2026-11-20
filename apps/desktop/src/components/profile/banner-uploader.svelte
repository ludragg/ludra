<script lang="ts">
  import {
    MAX_BANNER_SIZE_MB,
    uploadBannerFile,
    validateBannerFile,
    type BannerCrop,
    type ProfileBanner,
  } from "@/services/profile-api";

  let {
    banner,
    onchange,
  }: {
    banner: ProfileBanner;
    onchange: (next: ProfileBanner) => void;
  } = $props();

  const solidPresets = ["#2e1065", "#1e1b4b", "#312e81", "#4c1d95", "#0f172a", "#1f2937", "#3b0764", "#172554"];

  let fileInput = $state<HTMLInputElement>();
  let error = $state("");
  let uploading = $state(false);
  let dragging = $state(false);
  let dragStart = { x: 0, y: 0, startX: 0, startY: 0 };

  const crop = $derived<BannerCrop>(banner.crop ?? { x: 0, y: 0, zoom: 1 });
  const hasMedia = $derived(Boolean(banner.url) && banner.type !== "color");

  async function onFileSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    error = "";
    const validation = validateBannerFile(file);
    if (!validation.ok) {
      error = validation.message;
      return;
    }

    uploading = true;
    try {
      const uploaded = await uploadBannerFile(file, { x: 0, y: 0, zoom: 1 });
      onchange({
        url: uploaded.url,
        staticFallbackUrl: uploaded.staticFallbackUrl,
        type: uploaded.type,
        color: banner.color,
        crop: { x: 0, y: 0, zoom: 1 },
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Erro ao enviar o fundo.";
    } finally {
      uploading = false;
    }
  }

  function updateCrop(patch: Partial<BannerCrop>) {
    onchange({
      ...banner,
      crop: {
        x: Math.max(-50, Math.min(50, patch.x ?? crop.x)),
        y: Math.max(-50, Math.min(50, patch.y ?? crop.y)),
        zoom: Math.max(1, Math.min(2.5, patch.zoom ?? crop.zoom)),
      },
    });
  }

  function startDrag(event: PointerEvent) {
    if (!hasMedia) return;
    dragging = true;
    dragStart = { x: event.clientX, y: event.clientY, startX: crop.x, startY: crop.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onDrag(event: PointerEvent) {
    if (!dragging) return;
    const dx = ((event.clientX - dragStart.x) / 3) * 0.7;
    const dy = ((event.clientY - dragStart.y) / 1.5) * 0.7;
    updateCrop({ x: dragStart.startX + dx, y: dragStart.startY + dy });
  }

  function endDrag() {
    dragging = false;
  }

  function setColor(color: string) {
    error = "";
    onchange({
      ...banner,
      url: "",
      type: "color",
      color,
    });
  }

  function removeBanner() {
    error = "";
    onchange({
      url: "",
      staticFallbackUrl: undefined,
      type: "color",
      color: banner.color || "#2e1065",
    });
  }
</script>

<div class="banner-uploader">
  <div class="banner-uploader__head">
    <div>
      <span class="banner-uploader__label">Fundo do perfil (Banner 3:1)</span>
      <p class="banner-uploader__hint">
        Aceita GIF/WebP animado, PNG ou JPG (até {MAX_BANNER_SIZE_MB} MB), ou cor sólida. Arraste para enquadrar.
      </p>
    </div>
  </div>

  <!-- Área de enquadramento 3:1 com arrastar e zoom -->
  <div
    class="banner-uploader__stage"
    class:banner-uploader__stage--draggable={hasMedia}
    class:banner-uploader__stage--dragging={dragging}
    style:background={banner.color}
    role="application"
    aria-label="Enquadramento do banner 3 para 1"
    onpointerdown={startDrag}
    onpointermove={onDrag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  >
    {#if hasMedia}
      <img
        class="banner-uploader__media"
        src={banner.url}
        alt="Prévia do banner"
        draggable="false"
        style:transform="translate({crop.x}%, {crop.y}%) scale({crop.zoom})"
      />
      <span class="banner-uploader__drag-hint">Arraste para enquadrar</span>
    {:else}
      <span class="banner-uploader__empty-hint">Cor sólida selecionada</span>
    {/if}
  </div>

  {#if hasMedia}
    <div class="banner-uploader__zoom">
      <label class="banner-uploader__zoom-label" for="banner-zoom">Zoom ({Math.round(crop.zoom * 100)}%)</label>
      <input
        id="banner-zoom"
        class="banner-uploader__slider"
        type="range"
        min="1"
        max="2.5"
        step="0.05"
        value={crop.zoom}
        oninput={(e) => updateCrop({ zoom: Number((e.currentTarget as HTMLInputElement).value) })}
      />
      <button type="button" class="banner-uploader__reset" onclick={() => updateCrop({ x: 0, y: 0, zoom: 1 })}>
        Centralizar
      </button>
    </div>
  {/if}

  <div class="banner-uploader__actions">
    <input
      bind:this={fileInput}
      class="sr-only"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onchange={onFileSelect}
    />
    <button
      type="button"
      class="banner-uploader__btn banner-uploader__btn--purple"
      disabled={uploading}
      onclick={() => fileInput?.click()}
    >
      {uploading ? "Enviando…" : "Enviar GIF ou imagem"}
    </button>
    {#if hasMedia}
      <button type="button" class="banner-uploader__btn banner-uploader__btn--ghost" onclick={removeBanner}>
        Remover fundo
      </button>
    {/if}
  </div>

  <div class="banner-uploader__colors">
    <span class="banner-uploader__colors-label">Cor sólida:</span>
    <div class="banner-uploader__swatches">
      {#each solidPresets as color (color)}
        <button
          type="button"
          class="banner-uploader__swatch"
          class:banner-uploader__swatch--active={banner.type === "color" && banner.color === color}
          style:background={color}
          aria-label="Cor {color}"
          onclick={() => setColor(color)}
        ></button>
      {/each}
      <label class="banner-uploader__color-picker" title="Escolher cor personalizada">
        <input
          type="color"
          value={banner.color}
          oninput={(e) => setColor((e.currentTarget as HTMLInputElement).value)}
        />
        <span>+</span>
      </label>
    </div>
  </div>

  {#if error}
    <p class="banner-uploader__error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .banner-uploader {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .banner-uploader__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .banner-uploader__label {
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
  }

  .banner-uploader__hint {
    margin: 2px 0 0;
    font-size: 12px;
    color: #9ca3af;
  }

  .banner-uploader__stage {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 1;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(139, 92, 246, 0.35);
    display: grid;
    place-items: center;
    user-select: none;
  }

  .banner-uploader__stage--draggable {
    cursor: grab;
  }

  .banner-uploader__stage--dragging {
    cursor: grabbing;
  }

  .banner-uploader__media {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    transform-origin: center;
  }

  .banner-uploader__drag-hint,
  .banner-uploader__empty-hint {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(11, 11, 15, 0.72);
    color: #d1d5db;
    font-size: 11px;
    pointer-events: none;
  }

  .banner-uploader__zoom {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .banner-uploader__zoom-label {
    font-size: 12px;
    color: #9ca3af;
    min-width: 82px;
  }

  .banner-uploader__slider {
    flex: 1;
    accent-color: #8b5cf6;
  }

  .banner-uploader__reset {
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: #181822;
    color: #d1d5db;
    font-size: 11px;
  }

  .banner-uploader__reset:hover {
    color: #ffffff;
    border-color: rgba(139, 92, 246, 0.5);
  }

  .banner-uploader__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .banner-uploader__btn {
    height: 34px;
    padding: 0 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    transition:
      background 150ms ease,
      box-shadow 150ms ease,
      border-color 150ms ease;
  }

  .banner-uploader__btn--purple {
    background: #111118;
    border: 1px solid #8b5cf6;
    color: #ffffff;
  }

  .banner-uploader__btn--purple:hover {
    background: #1a1a26;
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.35);
  }

  .banner-uploader__btn--ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #9ca3af;
  }

  .banner-uploader__btn--ghost:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .banner-uploader__colors {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .banner-uploader__colors-label {
    font-size: 12px;
    color: #9ca3af;
  }

  .banner-uploader__swatches {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .banner-uploader__swatch {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    padding: 0;
  }

  .banner-uploader__swatch--active {
    border-color: #ffffff;
    box-shadow: 0 0 0 2px #8b5cf6;
  }

  .banner-uploader__color-picker {
    position: relative;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px dashed rgba(255, 255, 255, 0.35);
    display: grid;
    place-items: center;
    font-size: 12px;
    color: #d1d5db;
    cursor: pointer;
    overflow: hidden;
  }

  .banner-uploader__color-picker input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .banner-uploader__error {
    margin: 0;
    font-size: 12px;
    color: #f87171;
  }
</style>
