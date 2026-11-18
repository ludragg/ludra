import React, { useState } from 'react';
import { Users } from 'lucide-react';
import type { CurrentUser, DirectMessage } from '../data/mock';
import { DMList } from './DMList';
import { UserPanel } from './UserPanel';

interface SidebarProps {
  dms: DirectMessage[];
  currentUser: CurrentUser;
  onRemoveDm: (e: React.MouseEvent, id: string) => void;
  onCreateGroup: () => void;
  onOpenFriends: () => void;
}

/**
 * Barra lateral de navegação e conversas do Ludra (240px de largura, fundo #0d0d0d).
 * Segue a separação estilo Discord com os elementos reais do Ludra:
 * - Topo (48px): input de busca "Encontre ou comece uma conversa"
 * - Botão "Amigos" com ícone
 * - Seção "Mensagens diretas" com botão "+" e estado vazio inicial ("Nenhuma conversa ainda.")
 * - Rodapé fixo: Painel do usuário
 */
export const Sidebar: React.FC<SidebarProps> = ({
  dms,
  currentUser,
  onRemoveDm,
  onCreateGroup,
  onOpenFriends,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDmId, setSelectedDmId] = useState<string | null>(null);

  const handleSelectFriends = () => {
    setSelectedDmId(null);
    onOpenFriends();
  };

  return (
    <aside
      aria-label="Navegação"
      className="hidden md:flex flex-col w-[240px] h-full bg-[#0d0d0d] border-r border-white/[0.08] flex-shrink-0 select-none z-20"
    >
      {/* Topo (48px): Input "Encontre ou comece uma conversa" */}
      <div className="h-12 px-2.5 flex items-center border-b border-black/40 flex-shrink-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Encontre ou comece uma conversa"
          aria-label="Encontre ou comece uma conversa"
          className="w-full h-[28px] bg-[#09090b] text-[#d0d1d7] placeholder-[#8e919b] text-[12px] rounded-[4px] px-2 text-center focus:text-left focus:outline-none focus:ring-1 focus:ring-[#c77dff] transition-all duration-100 select-text"
        />
      </div>

      {/* Botão Amigos */}
      <div className="px-2 pt-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleSelectFriends}
          className={`w-full h-[42px] flex items-center space-x-3 px-3 rounded-[4px] text-[15px] font-medium transition-colors duration-100 focus:outline-none ${
            !selectedDmId
              ? 'bg-white/[0.1] text-[#f0f1f7]'
              : 'text-[#8e919b] hover:bg-white/[0.06] hover:text-[#d0d1d7]'
          }`}
        >
          <Users className="w-[22px] h-[22px] flex-shrink-0" />
          <span>Amigos</span>
        </button>
      </div>

      {/* Lista de Mensagens Diretas (inicia vazia para novos usuários) */}
      <DMList
        dms={dms}
        searchQuery={searchQuery}
        selectedDmId={selectedDmId}
        onSelectDm={setSelectedDmId}
        onRemoveDm={onRemoveDm}
        onCreateGroup={onCreateGroup}
      />

      {/* Rodapé fixo: Painel do usuário */}
      <UserPanel user={currentUser} />
    </aside>
  );
};
