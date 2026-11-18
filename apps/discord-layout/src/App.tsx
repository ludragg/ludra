import React, { useState } from 'react';
import {
  currentUser,
  mockServers,
  mockDMs,
  mockFriends,
  mockActiveGroups,
  type DirectMessage,
  type ServerItem,
  type Friend,
} from './data/mock';
import { TitleBar } from './components/TitleBar';
import { ServerBar } from './components/ServerBar';
import { Sidebar } from './components/Sidebar';
import { FriendsHeader, type FriendsTab } from './components/FriendsHeader';
import { FriendsList } from './components/FriendsList';
import { ActiveNow } from './components/ActiveNow';
import { X } from 'lucide-react';

/**
 * Interface do Ludra v0.2.3 com a separação estrutural de 4 colunas estilo Discord:
 * - Inicia 100% limpa (sem grupos, conversas ou amigos pré-colocados), pronta para
 *   quando o usuário baixar e criar seus próprios grupos/contatos do zero.
 */
export function App() {
  const [activeServerId, setActiveServerId] = useState<string>('home');
  const [servers, setServers] = useState<ServerItem[]>(mockServers);
  const [dms, setDms] = useState<DirectMessage[]>(mockDMs);
  const [friends, setFriends] = useState<Friend[]>(mockFriends);
  const [activeTab, setActiveTab] = useState<FriendsTab>('online');
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const handleRemoveDm = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDms((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddFriend = (username: string) => {
    const newFriend: Friend = {
      id: `fr-${Date.now()}`,
      name: username,
      username,
      initials: username.slice(0, 1).toUpperCase(),
      avatarBg: '#c77dff',
      status: 'online',
      statusText: 'Online',
      activityType: 'none',
    };
    setFriends((prev) => [...prev, newFriend]);
  };

  const handleCreateGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newGroupName.trim();
    if (!clean) return;
    const newGroup: ServerItem = {
      id: `grp-${Date.now()}`,
      name: clean,
      initials: clean.slice(0, 2).toUpperCase(),
    };
    setServers((prev) => [...prev, newGroup]);
    setNewGroupName('');
    setIsGroupDialogOpen(false);
    setActiveServerId(newGroup.id);
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#0d0d0d] text-[#d0d1d7] font-sans">
      {/* Barra de título superior nativa do Ludra v0.2.3 */}
      <TitleBar />

      {/* Corpo em 4 colunas (estilo Discord com paleta e estados limpos do Ludra) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 1. Barra de grupos (72px) */}
        <ServerBar
          servers={servers}
          activeServerId={activeServerId}
          onSelectServer={setActiveServerId}
          onCreateGroup={() => setIsGroupDialogOpen(true)}
        />

        {/* 2. Sidebar de DMs (240px, escondida abaixo de 768px) */}
        <Sidebar
          dms={dms}
          currentUser={currentUser}
          onRemoveDm={handleRemoveDm}
          onCreateGroup={() => setIsGroupDialogOpen(true)}
          onOpenFriends={() => setActiveServerId('home')}
        />

        {/* 3 + 4. Área principal + Painel "Ativo agora" */}
        <main className="flex-1 flex flex-col min-w-0 h-full bg-[#121212]">
          {/* Header de 48px com abas Online / Todos / Pendentes / Bloqueados / Adicionar amigo */}
          <FriendsHeader activeTab={activeTab} onChangeTab={setActiveTab} />

          {/* Corpo dividido entre Lista de Amigos (flexível) e Painel "Ativo agora" */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <FriendsList
              friends={friends}
              activeTab={activeTab}
              onAddFriend={handleAddFriend}
            />
            <ActiveNow activeGroups={mockActiveGroups} />
          </div>
        </main>
      </div>

      {/* Modal oficial do Ludra para Criar grupo do zero */}
      {isGroupDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Criar grupo"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[420px] bg-[#121212] border border-white/[0.08] rounded-[10px] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[16px] font-bold text-[#f0f1f7] m-0">
                Criar grupo
              </h2>
              <button
                type="button"
                aria-label="Cancelar"
                onClick={() => setIsGroupDialogOpen(false)}
                className="text-[#8e919b] hover:text-[#f0f1f7] p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-[#8e919b] mb-4">
              Escolha um nome e os amigos que vão participar. Até 10 pessoas.
            </p>
            <form onSubmit={handleCreateGroupSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#d0d1d7] mb-1.5">
                  Nome do grupo
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ex.: Squad de Sexta"
                  autoFocus
                  className="w-full h-[38px] bg-[#09090b] border border-white/[0.08] focus:border-[#c77dff] rounded-[6px] px-3 text-sm text-[#f0f1f7] placeholder-[#8e919b] focus:outline-none select-text"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGroupDialogOpen(false)}
                  className="px-4 py-2 rounded-[6px] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-[#d0d1d7]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newGroupName.trim()}
                  className="px-4 py-2 rounded-[6px] bg-[#c77dff] hover:bg-[#b565f2] disabled:opacity-50 text-xs font-bold text-[#0d0d0d]"
                >
                  Criar grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
