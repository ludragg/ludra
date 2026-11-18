import React from 'react';
import type { ActiveCallGroup } from '../data/mock';

interface ActiveNowProps {
  activeGroups?: ActiveCallGroup[];
}

/**
 * Painel lateral direito "Ativo agora" (320px de largura, escondido em telas < 1100px/1200px).
 * Segue exatamente o componente `active-now.svelte` do Ludra:
 * - Quando o usuário baixa o app do zero (sem chamadas em andamento), mostra:
 *   "Tudo quieto por aqui"
 *   "Quando um dos seus grupos estiver em chamada, ele aparece aqui para você entrar."
 */
export const ActiveNow: React.FC<ActiveNowProps> = ({ activeGroups = [] }) => {
  return (
    <aside
      aria-labelledby="active-title"
      className="hidden xl-discord:flex flex-col w-[320px] h-full border-l border-black/30 bg-[#121212] flex-shrink-0 select-none"
    >
      {/* Header de 48px alinhado com o FriendsHeader */}
      <header className="h-12 px-4 flex items-center border-b border-black/30 flex-shrink-0">
        <h2
          id="active-title"
          className="text-[20px] font-semibold text-[#f0f1f7] m-0"
        >
          Ativo agora
        </h2>
      </header>

      {activeGroups.length > 0 ? (
        <ul className="p-4 space-y-2 overflow-y-auto discord-scrollbar list-none m-0">
          {activeGroups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                className="w-full px-3 py-2.5 flex items-center gap-2.5 rounded-[8px] bg-[#0d0d0d] hover:bg-white/[0.06] text-left transition-colors duration-100"
              >
                <div className="w-10 h-10 rounded-full bg-[#18181b] flex items-center justify-center font-bold text-[#f0f1f7] flex-shrink-0">
                  {group.initials}
                </div>
                <div className="min-w-0 flex-1 flex flex-col">
                  <span className="font-semibold text-[#f0f1f7] truncate">
                    {group.name}
                  </span>
                  <div className="flex items-center gap-2 text-[12px] text-[#8e919b]">
                    <span className="font-semibold text-[#1c9749] tabular-nums">
                      {group.elapsed}
                    </span>
                    <span>{group.participantsCount} na chamada</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-6 py-7 flex flex-col gap-1.5">
          <p className="m-0 font-semibold text-[#f0f1f7] text-[14px]">
            Tudo quieto por aqui
          </p>
          <p className="m-0 text-[13px] text-[#8e919b] leading-relaxed">
            Quando um dos seus grupos estiver em chamada, ele aparece aqui para
            você entrar.
          </p>
        </div>
      )}
    </aside>
  );
};
