import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { Friend } from '../data/mock';
import type { FriendsTab } from './FriendsHeader';
import { FriendRow } from './FriendRow';

interface FriendsListProps {
  friends: Friend[];
  activeTab: FriendsTab;
  onAddFriend: (username: string) => void;
}

/**
 * Área de conteúdo da lista de amigos do Ludra:
 * - Quando não há amigos na aba selecionada, exibe no centro a logo oficial do dragão
 *   do Ludra meio transparente com o texto de estado vazio ("Nenhum amigo online no momento.", etc.).
 */
export const FriendsList: React.FC<FriendsListProps> = ({
  friends,
  activeTab,
  onAddFriend,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [friendRequestInput, setFriendRequestInput] = useState('');
  const [requestSentMessage, setRequestSentMessage] = useState<string | null>(null);

  const filteredFriends = useMemo(() => {
    if (activeTab === 'pending' || activeTab === 'blocked') {
      return [];
    }

    const byTab =
      activeTab === 'online'
        ? friends.filter((f) => f.status === 'online')
        : friends;

    if (!searchQuery.trim()) return byTab;

    const query = searchQuery.toLowerCase();
    return byTab.filter(
      (f) =>
        f.name.toLowerCase().includes(query) ||
        f.username.toLowerCase().includes(query)
    );
  }, [friends, activeTab, searchQuery]);

  const handleSendFriendRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = friendRequestInput.trim();
    if (!clean) return;
    onAddFriend(clean);
    setRequestSentMessage(`Pedido enviado para ${clean}.`);
    setFriendRequestInput('');
  };

  if (activeTab === 'add') {
    return (
      <div className="flex-1 flex flex-col px-7 py-5 overflow-y-auto discord-main-scrollbar bg-[#121212]">
        <h2
          className="text-[16px] font-bold uppercase text-[#f0f1f7] tracking-wide mb-1.5"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Adicionar amigo
        </h2>
        <p className="text-[13px] text-[#8e919b] mb-4">
          Digite o nome de usuário da pessoa para enviar um pedido de amizade.
        </p>

        <form
          onSubmit={handleSendFriendRequest}
          className="flex items-center bg-[#09090b] rounded-[8px] px-4 py-2 border border-white/[0.08] focus-within:border-[#c77dff] transition-colors duration-150"
        >
          <input
            type="text"
            value={friendRequestInput}
            onChange={(e) => {
              setFriendRequestInput(e.target.value);
              setRequestSentMessage(null);
            }}
            placeholder="Nome de usuário"
            aria-label="Nome de usuário"
            className="flex-1 bg-transparent text-sm text-[#f0f1f7] placeholder-[#8e919b] focus:outline-none select-text"
          />
          <button
            type="submit"
            disabled={!friendRequestInput.trim()}
            className="ml-3 px-4 py-1.5 rounded-[6px] bg-[#c77dff] hover:bg-[#b565f2] disabled:opacity-50 disabled:cursor-not-allowed text-[#0d0d0d] text-xs font-bold transition-colors duration-150 focus:outline-none"
          >
            Enviar pedido
          </button>
        </form>

        {requestSentMessage && (
          <p className="mt-2.5 text-xs font-medium text-[#1c9749]">
            {requestSentMessage}
          </p>
        )}

        {/* Estado vazio centralizado com a logo do Ludra meio transparente */}
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <LudraEmptyBrand />
          <p className="text-[14px] text-[#8e919b] mt-4 max-w-xs">
            Adicione seus amigos para conversar e entrar em chamadas de voz no Ludra.
          </p>
        </div>
      </div>
    );
  }

  const sectionLabel =
    activeTab === 'online'
      ? `ONLINE — ${filteredFriends.length}`
      : activeTab === 'pending'
      ? `PENDENTES — 0`
      : activeTab === 'blocked'
      ? `BLOQUEADOS — 0`
      : `TODOS OS AMIGOS — ${filteredFriends.length}`;

  const emptyMessage = searchQuery.trim()
    ? 'Nenhum amigo encontrado com esse nome no Ludra.'
    : activeTab === 'online'
    ? 'Nenhum amigo online no momento.'
    : activeTab === 'all'
    ? 'Você ainda não tem amigos adicionados.'
    : activeTab === 'pending'
    ? 'Não há pedidos de amizade pendentes no momento.'
    : 'Você não bloqueou nenhum usuário.';

  return (
    <div className="flex-1 flex flex-col min-h-0 px-7 pt-4 bg-[#121212]">
      {/* Input de busca com ícone de lupa e placeholder "Buscar" */}
      <div className="relative flex items-center bg-[#09090b] border border-white/[0.08] rounded-[8px] px-3.5 h-[40px] mb-5 flex-shrink-0 focus-within:border-[#c77dff] transition-colors duration-150">
        <Search
          className="w-4 h-4 text-[#8e919b] pointer-events-none flex-shrink-0 mr-2.5"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar amigos"
          className="w-full bg-transparent text-sm text-[#d0d1d7] placeholder-[#8e919b] focus:outline-none pr-7 select-text"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => setSearchQuery('')}
            className="text-[#8e919b] hover:text-[#f0f1f7] transition-colors duration-150 focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Título da seção ex: "ONLINE — 0" */}
      <div className="pb-2 flex-shrink-0">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#8e919b]">
          {sectionLabel}
        </h2>
      </div>

      {/* Lista de amigos (quando houver) ou Estado vazio centralizado com a logo do Ludra meio transparente */}
      {filteredFriends.length > 0 ? (
        <div
          role="list"
          aria-label="Lista de amigos"
          className="flex-1 overflow-y-auto discord-main-scrollbar pr-1 pb-6"
        >
          {filteredFriends.map((friend) => (
            <FriendRow key={friend.id} friend={friend} />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center pb-12">
          <LudraEmptyBrand />
          <p className="text-[14px] text-[#8e919b] mt-4 max-w-xs">
            {emptyMessage}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Logo oficial do dragão Ludra meio transparente centralizada para estado vazio
 */
const LudraEmptyBrand: React.FC = () => (
  <div className="w-24 h-24 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center shadow-inner">
    <img
      src="/ludra-logo.png"
      alt="Ludra"
      className="w-14 h-14 object-contain opacity-35 select-none"
      draggable={false}
    />
  </div>
);
