import { fetchUserProfile, getSeedProfiles, updateMyProfile, type UserProfile } from "@/services/profile-api";
import { presenceStore } from "@/stores/presence.svelte";

type ProfileSyncListener = (profile: UserProfile) => void;

/**
 * Store reativo de perfis do Ludra + hook `useProfile(userId)` com cache em memória
 * e sincronização com a fonte global de dados do usuário (`chat` store).
 */
class ProfileStore {
  cache = $state<Record<string, UserProfile>>(getSeedProfiles());
  loading = $state<Record<string, boolean>>({});
  modalUserId = $state<string | null>(null);
  modalFallbackName = $state<string>("");
  /** Define qual aba abrir ao navegar para Configurações (ex.: "profile") */
  pendingSettingsTab = $state<"profile" | "account" | null>(null);
  /** Indica se há alterações não salvas no editor de perfil */
  hasUnsavedChanges = $state(false);

  #syncListeners = new Set<ProfileSyncListener>();

  constructor() {
    // Mantém o cache de perfil sincronizado quando o status muda pelo menu da sidebar ou ausente automático
    presenceStore.onStatusChanged((userId, status) => {
      const existing = this.cache[userId];
      if (existing && existing.status !== status) {
        this.cache[userId] = { ...existing, status };
      }
    });
  }

  onProfileSaved(listener: ProfileSyncListener): () => void {
    this.#syncListeners.add(listener);
    return () => this.#syncListeners.delete(listener);
  }

  /** Abre o card/modal de perfil de um usuário */
  openModal(userId: string, fallbackUsername = "") {
    this.modalUserId = userId;
    this.modalFallbackName = fallbackUsername;
    void this.load(userId, fallbackUsername);
  }

  closeModal() {
    this.modalUserId = null;
  }

  /** Busca e faz cache do perfil de um usuário */
  async load(userId: string, fallbackUsername = "", force = false): Promise<UserProfile> {
    if (!force && this.cache[userId]) {
      return this.cache[userId];
    }

    this.loading[userId] = true;
    try {
      const profile = await fetchUserProfile(userId, fallbackUsername);
      this.cache[userId] = profile;
      return profile;
    } finally {
      this.loading[userId] = false;
    }
  }

  /**
   * Salva alterações no perfil do usuário atual, atualiza o cache global
   * e notifica todos os assinantes (sidebar, chat, lista de membros, ProfileCard).
   */
  async saveMe(userId: string, patch: Partial<UserProfile>): Promise<UserProfile> {
    const updated = await updateMyProfile(userId, patch);
    this.cache[userId] = updated;
    this.hasUnsavedChanges = false;
    presenceStore.publish(userId, {
      status: updated.status,
      activity: updated.activity,
      privacy: updated.activityPrivacy,
    });
    for (const listener of this.#syncListeners) {
      listener(updated);
    }
    return updated;
  }
}

export const profileStore = new ProfileStore();

/**
 * Hook reativo `useProfile(userId)` para buscar e cachear o perfil de qualquer usuário.
 */
export function useProfile(getUserId: () => string | null, getFallbackName: () => string = () => "") {
  $effect(() => {
    const id = getUserId();
    if (id && !profileStore.cache[id] && !profileStore.loading[id]) {
      void profileStore.load(id, getFallbackName());
    }
  });

  return {
    get profile(): UserProfile | null {
      const id = getUserId();
      return id ? (profileStore.cache[id] ?? null) : null;
    },
    get loading(): boolean {
      const id = getUserId();
      return id ? Boolean(profileStore.loading[id]) : false;
    },
    refresh() {
      const id = getUserId();
      if (id) {
        return profileStore.load(id, getFallbackName(), true);
      }
      return Promise.resolve(null);
    },
  };
}
