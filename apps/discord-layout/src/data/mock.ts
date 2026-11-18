export type UserStatus = 'online' | 'offline' | 'invisible' | 'idle' | 'dnd';

export interface ServerItem {
  id: string;
  name: string;
  iconUrl?: string;
  initials?: string;
  bgColor?: string;
  hasNotification?: boolean;
  mentionsCount?: number;
  isLiveCall?: boolean;
}

export interface DirectMessage {
  id: string;
  name: string;
  avatarUrl?: string;
  secondaryAvatarUrl?: string;
  status?: UserStatus;
  subtitle?: string;
  timestamp?: string;
  isGroup?: boolean;
  isOfficial?: boolean;
  hasCrown?: boolean;
  avatarBg?: string;
  initials?: string;
}

export interface Friend {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  initials?: string;
  avatarBg?: string;
  status: UserStatus;
  statusText: string;
  activityType?: 'game' | 'call' | 'none';
  gameName?: string;
}

export interface ActiveCallGroup {
  id: string;
  name: string;
  initials: string;
  elapsed: string;
  participantsCount: number;
}

export interface CurrentUser {
  id: string;
  displayName: string;
  stylizedName: string;
  username: string;
  avatarUrl?: string;
  initials: string;
  avatarBg: string;
  status: UserStatus;
  statusLabel: string;
}

export const currentUser: CurrentUser = {
  id: 'me',
  displayName: 'Usuário',
  stylizedName: 'Usuário',
  username: 'usuario',
  initials: 'U',
  avatarBg: '#1c9778',
  status: 'online',
  statusLabel: 'Online',
};

// Inicia limpo (sem grupos, conversas ou contatos pré-cadastrados)
export const mockServers: ServerItem[] = [];

export const mockDMs: DirectMessage[] = [];

export const mockFriends: Friend[] = [];

export const mockActiveGroups: ActiveCallGroup[] = [];
