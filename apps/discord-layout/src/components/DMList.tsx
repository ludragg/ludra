import React from 'react';
import { Plus } from 'lucide-react';
import type { DirectMessage } from '../data/mock';
import { DMItem } from './DMItem';

interface DMListProps {
  dms: DirectMessage[];
  searchQuery: string;
  selectedDmId: string | null;
  onSelectDm: (id: string) => void;
  onRemoveDm: (e: React.MouseEvent, id: string) => void;
  onCreateGroup: () => void;
}

/**
 * Seção "Mensagens diretas" na Sidebar do Ludra:
 * - Cabeçalho "Mensagens diretas" com botão "+" (Criar grupo) à direita
 * - Quando o usuário baixa do zero e ainda não tem conversas, exibe "Nenhuma conversa ainda."
 */
export const DMList: React.FC<DMListProps> = ({
  dms,
  searchQuery,
  selectedDmId,
  onSelectDm,
  onRemoveDm,
  onCreateGroup,
}) => {
  const needle = searchQuery.trim().toLowerCase();
  const visibleDms = needle
    ? dms.filter((d) => d.name.toLowerCase().includes(needle))
    : dms;

  return (
    <section className="flex flex-col flex-1 min-h-0 px-2">
      {/* Cabeçalho Mensagens diretas + botão Criar grupo */}
      <div className="flex items-center justify-between pt-[18px] pb-1 pl-2.5 pr-2">
        <h2 className="text-[12px] font-medium text-[#8e919b] m-0">
          Mensagens diretas
        </h2>
        <button
          type="button"
          aria-label="Criar grupo"
          title="Criar grupo"
          onClick={onCreateGroup}
          className="w-5 h-5 flex items-center justify-center text-[#8e919b] hover:text-[#f0f1f7] transition-colors duration-100 focus:outline-none"
        >
          <Plus className="w-4 h-4 stroke-[2.4]" />
        </button>
      </div>

      {/* Lista de conversas ou estado vazio limpo */}
      {visibleDms.length > 0 ? (
        <div className="flex-1 overflow-y-auto discord-scrollbar space-y-0.5 pb-3">
          {visibleDms.map((dm) => (
            <DMItem
              key={dm.id}
              dm={dm}
              isSelected={selectedDmId === dm.id}
              onSelect={onSelectDm}
              onRemove={onRemoveDm}
            />
          ))}
        </div>
      ) : (
        <p className="px-2.5 py-2 text-[12px] text-[#8e919b] m-0">
          {needle ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
        </p>
      )}
    </section>
  );
};
