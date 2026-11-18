import React from 'react';
import { Users, MessageSquarePlus, Inbox } from 'lucide-react';

export type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

interface FriendsHeaderProps {
  activeTab: FriendsTab;
  onChangeTab: (tab: FriendsTab) => void;
}

/**
 * Header superior (48px) da área principal com o visual e paleta do Ludra
 * e a organização estrutural estilo Discord:
 * - Ícone de amigos + "Amigos" em negrito + divisória sutil
 * - Abas: "Online", "Todos", "Pendentes", "Bloqueados" e botão roxo/lilás (#c77dff) "Adicionar amigo"
 * - À direita: ícones de "Nova DM de grupo" e "Caixa de Entrada"
 */
export const FriendsHeader: React.FC<FriendsHeaderProps> = ({
  activeTab,
  onChangeTab,
}) => {
  return (
    <header className="h-12 px-5 flex items-center justify-between border-b border-white/[0.08] bg-[#121212] flex-shrink-0 select-none z-10">
      {/* Lado esquerdo: Título Amigos + Abas */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-2 text-[#f0f1f7] pr-1">
          <Users className="w-5 h-5 text-[#d0d1d7]" aria-hidden="true" />
          <h1
            className="text-[15px] font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Amigos
          </h1>
        </div>

        {/* Separador vertical sutil do Ludra + pontinho */}
        <span className="w-[1px] h-5 bg-white/[0.08]" aria-hidden="true" />

        {/* Abas de filtro */}
        <nav aria-label="Filtros de amigos" className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => onChangeTab('online')}
            className={`px-3 py-1 rounded-[6px] text-[13px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff] ${
              activeTab === 'online'
                ? 'bg-white/[0.1] text-[#f0f1f7]'
                : 'text-[#8e919b] hover:bg-white/[0.06] hover:text-[#d0d1d7]'
            }`}
          >
            Online
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('all')}
            className={`px-3 py-1 rounded-[6px] text-[13px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff] ${
              activeTab === 'all'
                ? 'bg-white/[0.1] text-[#f0f1f7]'
                : 'text-[#8e919b] hover:bg-white/[0.06] hover:text-[#d0d1d7]'
            }`}
          >
            Todos
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('pending')}
            className={`hidden sm:inline-flex px-3 py-1 rounded-[6px] text-[13px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff] ${
              activeTab === 'pending'
                ? 'bg-white/[0.1] text-[#f0f1f7]'
                : 'text-[#8e919b] hover:bg-white/[0.06] hover:text-[#d0d1d7]'
            }`}
          >
            Pendentes
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('blocked')}
            className={`hidden sm:inline-flex px-3 py-1 rounded-[6px] text-[13px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff] ${
              activeTab === 'blocked'
                ? 'bg-white/[0.1] text-[#f0f1f7]'
                : 'text-[#8e919b] hover:bg-white/[0.06] hover:text-[#d0d1d7]'
            }`}
          >
            Bloqueados
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('add')}
            className={`ml-1 px-3 py-1 rounded-[6px] text-[13px] font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f0f1f7] ${
              activeTab === 'add'
                ? 'bg-[#c77dff]/20 text-[#c77dff] border border-[#c77dff]/50'
                : 'bg-[#c77dff] hover:bg-[#b565f2] text-[#0d0d0d]'
            }`}
          >
            Adicionar amigo
          </button>
        </nav>
      </div>

      {/* Lado direito: Ícones de nova conversa em grupo e caixa de entrada */}
      <div className="flex items-center space-x-2 text-[#8e919b]">
        <button
          type="button"
          aria-label="Criar novo grupo"
          title="Criar novo grupo"
          className="p-1.5 rounded hover:bg-white/[0.08] hover:text-[#f0f1f7] transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          <MessageSquarePlus className="w-[18px] h-[18px]" />
        </button>

        <div className="w-[1px] h-5 bg-white/[0.08]" aria-hidden="true" />

        <button
          type="button"
          aria-label="Caixa de Entrada"
          title="Caixa de Entrada"
          className="p-1.5 rounded hover:bg-white/[0.08] hover:text-[#f0f1f7] transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          <Inbox className="w-[18px] h-[18px]" />
        </button>
      </div>
    </header>
  );
};
