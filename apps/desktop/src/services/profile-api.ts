/**
 * Ludra Profile API Service (100% gratuito para todos os usuários)
 *
 * Persistência local via localStorage (`ludra:profile:<userId>`) enquanto o backend não está conectado.
 * Estrutura pronta para trocar os mocks por chamadas reais à API:
 * - GET    /users/:id/profile
 * - PATCH  /users/me/profile
 * - POST   /users/me/banner  (URL assinada para S3 / Supabase Storage + validação server-side)
 * - POST   /users/me/avatar  (URL assinada para S3 / Supabase Storage + validação server-side)
 */

import { PRESENCE_STATUSES, type PresenceStatus } from "@/constants/presence";
import { makeGameCoverSvg, type ActivityPrivacy, type UserActivity } from "@/services/activity-providers";

export type ProfileStatus = PresenceStatus;
export type BannerType = "gif" | "image" | "color";

export interface BannerCrop {
  /** Posição horizontal de -50 a 50 (%) */
  x: number;
  /** Posição vertical de -50 a 50 (%) */
  y: number;
  /** Escala de 1 a 2.5 */
  zoom: number;
}

export interface ProfileBanner {
  url: string;
  /** Primeiro frame estático gerado para fallback quando prefers-reduced-motion estiver ativo */
  staticFallbackUrl?: string;
  type: BannerType;
  color: string;
  crop?: BannerCrop;
}

export interface MutualGroup {
  id: string;
  name: string;
  color: string;
  initials: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarStaticFallback?: string;
  banner: ProfileBanner;
  accentColor: string;
  description: string;
  status: ProfileStatus;
  activity: UserActivity | null;
  activityPrivacy: ActivityPrivacy;
  createdAt: string;
  mutualGroups: MutualGroup[];
}

/** Limite configurável em MB para upload de banner (GIF/WebP/PNG/JPG) */
export const MAX_BANNER_SIZE_MB = 8;
export const MAX_BANNER_SIZE_BYTES = MAX_BANNER_SIZE_MB * 1024 * 1024;
/** Limite configurável em MB para upload de avatar (PNG/JPG/WebP/GIF) */
export const MAX_AVATAR_SIZE_MB = 4;
export const MAX_AVATAR_SIZE_BYTES = MAX_AVATAR_SIZE_MB * 1024 * 1024;
/** Limite de caracteres da descrição */
export const DESCRIPTION_MAX_LENGTH = 190;

const ANIMATED_MIMES = new Set(["image/gif", "image/webp"]);
const STATIC_MIMES = new Set(["image/png", "image/jpeg"]);

/**
 * Clona objetos removendo Proxies reativos do Svelte 5 (evita DataCloneError do structuredClone).
 */
export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storageKey(userId: string): string {
  return `ludra:profile:${userId}`;
}

/** Remove caracteres de controle invisíveis de textos enviados pelo usuário */
function sanitizeText(value: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

function isValidStatus(value: unknown): value is PresenceStatus {
  return typeof value === "string" && value in PRESENCE_STATUSES;
}

function normalizeStoredProfile(userId: string, raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<UserProfile> & { bio?: string };
  const seed = mockProfiles[userId];
  const bannerRaw = parsed.banner && typeof parsed.banner === "object" ? parsed.banner : undefined;
  const bannerType =
    bannerRaw?.type === "gif" || bannerRaw?.type === "image" || bannerRaw?.type === "color" ? bannerRaw.type : "color";

  // Migração automática: converte campo legado `bio` para `description` sem perder o texto salvo
  const rawDescription =
    typeof parsed.description === "string"
      ? parsed.description
      : typeof parsed.bio === "string"
        ? parsed.bio
        : (seed?.description ?? "");

  return {
    id: typeof parsed.id === "string" && parsed.id ? parsed.id : userId,
    username: typeof parsed.username === "string" && parsed.username ? parsed.username : (seed?.username ?? "usuario"),
    displayName:
      typeof parsed.displayName === "string" && parsed.displayName.trim()
        ? sanitizeText(parsed.displayName, 32)
        : (seed?.displayName ?? "Usuário"),
    avatar: typeof parsed.avatar === "string" ? parsed.avatar : "",
    avatarStaticFallback: typeof parsed.avatarStaticFallback === "string" ? parsed.avatarStaticFallback : undefined,
    banner: {
      url: typeof bannerRaw?.url === "string" ? bannerRaw.url : "",
      staticFallbackUrl: typeof bannerRaw?.staticFallbackUrl === "string" ? bannerRaw.staticFallbackUrl : undefined,
      type: bannerType,
      color: typeof bannerRaw?.color === "string" && bannerRaw.color ? bannerRaw.color : "#2e1065",
      crop:
        bannerRaw?.crop && typeof bannerRaw.crop === "object"
          ? {
              x: Number(bannerRaw.crop.x) || 0,
              y: Number(bannerRaw.crop.y) || 0,
              zoom: Number(bannerRaw.crop.zoom) || 1,
            }
          : undefined,
    },
    accentColor: typeof parsed.accentColor === "string" ? parsed.accentColor : "",
    description: sanitizeText(rawDescription, DESCRIPTION_MAX_LENGTH),
    status: isValidStatus(parsed.status) ? parsed.status : (seed?.status ?? "online"),
    activity: parsed.activity && typeof parsed.activity === "object" ? parsed.activity : null,
    activityPrivacy: {
      showActivity: parsed.activityPrivacy?.showActivity ?? true,
      showElapsed: parsed.activityPrivacy?.showElapsed ?? true,
    },
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : (seed?.createdAt ?? new Date().toISOString()),
    mutualGroups: Array.isArray(parsed.mutualGroups) ? parsed.mutualGroups : (seed?.mutualGroups ?? []),
  };
}

export function readStoredProfile(userId: string): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    return normalizeStoredProfile(userId, JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(profile.id), JSON.stringify(profile));
  } catch {
    throw new Error("Não foi possível salvar localmente (limite de armazenamento atingido). Tente uma imagem menor.");
  }
}

export type MediaValidationResult =
  { ok: true; kind: "gif" | "image" } | { ok: false; reason: "invalid_type" | "too_large"; message: string };

/**
 * Validação client-side de MIME e tamanho para banner.
 * TODO (Backend): Repetir esta validação no servidor (magic bytes + Content-Length)
 * no endpoint POST /users/me/banner antes de emitir a URL assinada (S3 / Supabase Storage).
 */
export function validateBannerFile(file: File): MediaValidationResult {
  const isAnimated = ANIMATED_MIMES.has(file.type) || /\.(gif|webp)$/i.test(file.name);
  const isStatic = STATIC_MIMES.has(file.type) || /\.(png|jpe?g)$/i.test(file.name);

  if (!isAnimated && !isStatic) {
    return {
      ok: false,
      reason: "invalid_type",
      message: "Formato não suportado. Use PNG, JPG, GIF ou WebP.",
    };
  }

  if (file.size > MAX_BANNER_SIZE_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `O arquivo excede o limite de ${MAX_BANNER_SIZE_MB} MB.`,
    };
  }

  return { ok: true, kind: isAnimated ? "gif" : "image" };
}

/**
 * Validação client-side de MIME e tamanho para avatar.
 * TODO (Backend): Validar magic bytes e tamanho no endpoint POST /users/me/avatar.
 */
export function validateAvatarFile(file: File): MediaValidationResult {
  const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
  const isWebp = file.type === "image/webp" || /\.webp$/i.test(file.name);
  const isStatic = STATIC_MIMES.has(file.type) || /\.(png|jpe?g)$/i.test(file.name);

  if (!isGif && !isWebp && !isStatic) {
    return {
      ok: false,
      reason: "invalid_type",
      message: "Formato inválido para avatar. Use PNG, JPG, WebP ou GIF.",
    };
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `O avatar excede o limite de ${MAX_AVATAR_SIZE_MB} MB.`,
    };
  }

  return { ok: true, kind: isGif ? "gif" : "image" };
}

/** Converte um File em data URL base64 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

/**
 * Recorta uma imagem estática em proporção 1:1 (256x256) usando Canvas.
 * Não deve ser usado em GIF animado (para não perder os frames da animação).
 */
export function cropStaticAvatarToDataUrl(
  sourceUrl: string,
  crop: { x: number; y: number; zoom: number },
  outputSize = 256,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível para recorte."));
          return;
        }

        const iw = img.naturalWidth || outputSize;
        const ih = img.naturalHeight || outputSize;
        const baseScale = Math.max(outputSize / iw, outputSize / ih);
        const scale = baseScale * crop.zoom;
        const drawW = iw * scale;
        const drawH = ih * scale;
        const offsetX = (crop.x / 100) * outputSize;
        const offsetY = (crop.y / 100) * outputSize;
        const dx = (outputSize - drawW) / 2 + offsetX;
        const dy = (outputSize - drawH) / 2 + offsetY;

        ctx.clearRect(0, 0, outputSize, outputSize);
        ctx.drawImage(img, dx, dy, drawW, drawH);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        reject(new Error("Falha ao recortar a imagem."));
      }
    };
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem para recorte."));
    img.src = sourceUrl;
  });
}

/**
 * Gera um GIF89a animado válido em memória (100% offline) para o mock do usuário com GIF de fundo.
 */
function createAnimatedLudraGifDataUrl(): string {
  const width = 48;
  const height = 16;
  const frames = 8;

  const palette = [
    [11, 11, 15],
    [18, 15, 32],
    [28, 20, 54],
    [42, 26, 82],
    [60, 34, 118],
    [82, 46, 158],
    [109, 64, 202],
    [139, 92, 246],
    [167, 139, 250],
    [196, 181, 253],
    [124, 58, 237],
    [91, 33, 182],
    [56, 189, 248],
    [34, 211, 238],
    [24, 24, 38],
    [15, 15, 24],
  ];

  const out: number[] = [];
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  const pushU16 = (v: number) => {
    out.push(v & 0xff, (v >> 8) & 0xff);
  };

  pushStr("GIF89a");
  pushU16(width);
  pushU16(height);
  out.push(0xf3, 0x00, 0x00);

  for (const [r, g, b] of palette) {
    out.push(r, g, b);
  }

  out.push(0x21, 0xff, 0x0b);
  pushStr("NETSCAPE2.0");
  out.push(0x03, 0x01, 0x00, 0x00, 0x00);

  const lzwMinCode = 4;
  const clearCode = 1 << lzwMinCode;
  const endCode = clearCode + 1;

  for (let f = 0; f < frames; f++) {
    out.push(0x21, 0xf9, 0x04, 0x04, 0x0c, 0x00, 0x00, 0x00);
    out.push(0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(width);
    pushU16(height);
    out.push(0x00);
    out.push(lzwMinCode);

    const bytes: number[] = [];
    let bitBuf = 0;
    let bitCount = 0;
    const emit = (code: number) => {
      bitBuf |= code << bitCount;
      bitCount += 5;
      while (bitCount >= 8) {
        bytes.push(bitBuf & 0xff);
        bitBuf >>= 8;
        bitCount -= 8;
      }
    };

    const phase = (f / frames) * Math.PI * 2;
    let sinceClear = 0;
    emit(clearCode);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wave1 = Math.sin((x / width) * Math.PI * 3 + phase);
        const wave2 = Math.cos((y / height) * Math.PI * 2 - phase + x * 0.12);
        const glow = (wave1 + wave2 + 2) / 4;
        let idx = Math.min(9, Math.max(0, Math.floor(glow * 10)));
        if (glow > 0.88 && (x + f) % 5 === 0) idx = 12;
        emit(idx);
        sinceClear++;
        if (sinceClear >= 12) {
          emit(clearCode);
          sinceClear = 0;
        }
      }
    }
    emit(endCode);
    if (bitCount > 0) bytes.push(bitBuf & 0xff);

    for (let i = 0; i < bytes.length; i += 255) {
      const chunk = bytes.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0x00);
  }

  out.push(0x3b);

  let binary = "";
  for (let i = 0; i < out.length; i++) {
    binary += String.fromCharCode(out[i]);
  }
  return `data:image/gif;base64,${btoa(binary)}`;
}

const STATIC_GAMER_BANNER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#1e1b4b"/>
        <stop offset="100%" stop-color="#312e81"/>
      </linearGradient>
    </defs>
    <rect width="600" height="200" fill="url(#g)"/>
    <circle cx="490" cy="40" r="110" fill="#6366f1" fill-opacity="0.18"/>
    <circle cx="110" cy="180" r="130" fill="#8b5cf6" fill-opacity="0.16"/>
    <path d="M0 150 Q150 95 300 135 T600 110 L600 200 L0 200 Z" fill="#0b0b0f" fill-opacity="0.45"/>
  </svg>`,
)}`;

const GIF_STATIC_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
    <defs>
      <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#180f2e"/>
        <stop offset="55%" stop-color="#4c1d95"/>
        <stop offset="100%" stop-color="#8b5cf6"/>
      </linearGradient>
    </defs>
    <rect width="600" height="200" fill="url(#p)"/>
    <circle cx="470" cy="60" r="95" fill="#38bdf8" fill-opacity="0.2"/>
  </svg>`,
)}`;

const MOCK_GIF_URL = createAnimatedLudraGifDataUrl();

/**
 * Extrai o primeiro frame estático de uma imagem/GIF via Canvas
 * para respeitar `prefers-reduced-motion`.
 */
export async function extractStaticFirstFrame(sourceUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 600;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(sourceUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(sourceUrl);
      }
    };
    img.onerror = () => resolve(sourceUrl);
    img.src = sourceUrl;
  });
}

const valorantCover = makeGameCoverSvg("#ff4655", "#1f1024", "#ff8a93", "VAL");
const cs2Cover = makeGameCoverSvg("#f59e0b", "#1c1917", "#fde68a", "CS2");
const lolCover = makeGameCoverSvg("#0ea5e9", "#1e1b4b", "#facc15", "LoL");

const mockProfiles: Record<string, UserProfile> = {
  // 1. Usuário com GIF animado de fundo e Counter-Strike 2 detectado via desktop
  "peer-1": {
    id: "peer-1",
    username: "dexty",
    displayName: "Dexty",
    avatar: "",
    banner: {
      url: MOCK_GIF_URL,
      staticFallbackUrl: GIF_STATIC_FALLBACK,
      type: "gif",
      color: "#8b5cf6",
      crop: { x: 0, y: 0, zoom: 1 },
    },
    accentColor: "#8b5cf6",
    description: "Main Jett / controlador nas horas vagas. Sempre on à noite pra fechar squad no Ludra.",
    status: "online",
    activity: {
      gameId: "cs2",
      type: "playing",
      name: "Counter-Strike 2",
      coverUrl: cs2Cover,
      startedAt: Date.now() - 42 * 60 * 1000,
      source: "desktop",
    },
    activityPrivacy: { showActivity: true, showElapsed: true },
    createdAt: "2025-03-14T18:00:00Z",
    mutualGroups: [
      { id: "preview-group-1", name: "Galera do Game", color: "#8b5cf6", initials: "GG" },
      { id: "preview-group-3", name: "Estudos", color: "#3e62c0", initials: "ES" },
    ],
  },
  // 2. Usuário com banner estático e jogo detectado via Steam
  "peer-2": {
    id: "peer-2",
    username: "felipe_dev",
    displayName: "Felipe",
    avatar: "",
    banner: {
      url: STATIC_GAMER_BANNER,
      staticFallbackUrl: STATIC_GAMER_BANNER,
      type: "image",
      color: "#312e81",
      crop: { x: 0, y: 0, zoom: 1 },
    },
    accentColor: "",
    description: "Estudando engenharia de software e tentando sair do prata no fim de semana.",
    status: "away",
    activity: {
      gameId: "lol",
      type: "playing",
      name: "League of Legends",
      coverUrl: lolCover,
      startedAt: Date.now() - 18 * 60 * 1000,
      source: "steam",
    },
    activityPrivacy: { showActivity: true, showElapsed: true },
    createdAt: "2025-08-22T14:30:00Z",
    mutualGroups: [
      { id: "preview-group-1", name: "Galera do Game", color: "#8b5cf6", initials: "GG" },
      { id: "preview-group-2", name: "Trabalho - Projeto", color: "#d08a52", initials: "TP" },
      { id: "preview-group-3", name: "Estudos", color: "#3e62c0", initials: "ES" },
    ],
  },
  // 3. Usuário online sem atividade
  "peer-3": {
    id: "peer-3",
    username: "gpaschoal01",
    displayName: "Gabriel Paschoal",
    avatar: "",
    banner: {
      url: "",
      type: "color",
      color: "#1e1b4b",
    },
    accentColor: "",
    description: "Café, FPS tático e música lo-fi. Manda DM se precisar de mais um pro time.",
    status: "online",
    activity: null,
    activityPrivacy: { showActivity: true, showElapsed: true },
    createdAt: "2026-01-10T21:15:00Z",
    mutualGroups: [{ id: "preview-group-1", name: "Galera do Game", color: "#8b5cf6", initials: "GG" }],
  },
  // 4. Usuário invisível com atividade detectada (NUNCA deve aparecer para os outros)
  "peer-4": {
    id: "peer-4",
    username: "ghost_gamer",
    displayName: "Ghost",
    avatar: "",
    banner: {
      url: "",
      type: "color",
      color: "#18181b",
    },
    accentColor: "",
    description: "Jogando solo em modo furtivo.",
    status: "invisible",
    activity: {
      gameId: "valorant",
      type: "playing",
      name: "Valorant",
      coverUrl: valorantCover,
      startedAt: Date.now() - 15 * 60 * 1000,
      source: "desktop",
    },
    activityPrivacy: { showActivity: true, showElapsed: true },
    createdAt: "2025-11-02T20:00:00Z",
    mutualGroups: [{ id: "preview-group-1", name: "Galera do Game", color: "#8b5cf6", initials: "GG" }],
  },
  // Próprio usuário
  "local-preview": {
    id: "local-preview",
    username: "felikovizk",
    displayName: "felikovizk",
    avatar: "",
    banner: {
      url: "",
      type: "color",
      color: "#2e1065",
    },
    accentColor: "#8b5cf6",
    description: "Criando e personalizando meu espaço no Ludra.",
    status: "online",
    activity: null,
    activityPrivacy: { showActivity: true, showElapsed: true },
    createdAt: "2025-01-05T12:00:00Z",
    mutualGroups: [
      { id: "preview-group-1", name: "Galera do Game", color: "#8b5cf6", initials: "GG" },
      { id: "preview-group-2", name: "Trabalho - Projeto", color: "#d08a52", initials: "TP" },
      { id: "preview-group-3", name: "Estudos", color: "#3e62c0", initials: "ES" },
    ],
  },
};

export function getSeedProfiles(): Record<string, UserProfile> {
  const result = clonePlain(mockProfiles);
  for (const id of Object.keys(result)) {
    const saved = readStoredProfile(id);
    if (saved) {
      result[id] = saved;
    }
  }
  return result;
}

/**
 * Busca o perfil completo de um usuário (com suporte a persistência em localStorage).
 * TODO (Backend): Substituir pelo endpoint real `GET /users/:id/profile`.
 */
export async function fetchUserProfile(userId: string, fallbackUsername = "usuario"): Promise<UserProfile> {
  const stored = readStoredProfile(userId);
  if (stored) {
    mockProfiles[userId] = clonePlain(stored);
    return clonePlain(stored);
  }

  await new Promise((resolve) => window.setTimeout(resolve, 140));

  const existing = mockProfiles[userId];
  if (existing) {
    return clonePlain(existing);
  }

  const generated: UserProfile = {
    id: userId,
    username: fallbackUsername,
    displayName: fallbackUsername,
    avatar: "",
    banner: { url: "", type: "color", color: "#1e1b4b" },
    accentColor: "",
    description: "",
    status: "online",
    activity: null,
    activityPrivacy: { showActivity: true, showElapsed: true },
    createdAt: new Date().toISOString(),
    mutualGroups: [],
  };
  mockProfiles[userId] = generated;
  return clonePlain(generated);
}

/**
 * Atualiza o perfil do usuário autenticado e persiste no localStorage (`ludra:profile:<userId>`).
 * TODO (Backend): Trocar a persistência em localStorage por `PATCH /users/me/profile`
 * e fazer upload de avatar/banner via URL assinada (`POST /users/me/avatar` e `POST /users/me/banner`).
 */
export async function updateMyProfile(userId: string, patch: Partial<UserProfile>): Promise<UserProfile> {
  const current = readStoredProfile(userId) ?? mockProfiles[userId] ?? (await fetchUserProfile(userId));
  const plainPatch = clonePlain(patch);

  const updated: UserProfile = {
    ...clonePlain(current),
    ...plainPatch,
    displayName: sanitizeText(plainPatch.displayName ?? current.displayName, 32),
    description: sanitizeText(plainPatch.description ?? current.description, DESCRIPTION_MAX_LENGTH),
    status: isValidStatus(plainPatch.status) ? plainPatch.status : current.status,
    banner: plainPatch.banner ? { ...clonePlain(current.banner), ...plainPatch.banner } : clonePlain(current.banner),
  };

  writeStoredProfile(updated);
  mockProfiles[userId] = clonePlain(updated);
  return clonePlain(updated);
}

/**
 * Faz upload de banner (GIF/WebP/PNG/JPG) e gera fallback estático do primeiro frame.
 * TODO (Backend): Substituir por `POST /users/me/banner` com URL assinada (S3 / Supabase Storage).
 */
export async function uploadBannerFile(
  file: File,
  crop: BannerCrop,
): Promise<{ url: string; staticFallbackUrl: string; type: "gif" | "image" }> {
  const validation = validateBannerFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const dataUrl = await fileToDataUrl(file);
  const staticFallbackUrl = validation.kind === "gif" ? await extractStaticFirstFrame(dataUrl) : dataUrl;

  return {
    url: dataUrl,
    staticFallbackUrl,
    type: validation.kind,
  };
}
