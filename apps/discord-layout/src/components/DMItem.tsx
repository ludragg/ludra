import React from 'react';
import { Crown, X, Check } from 'lucide-react';
import type { DirectMessage } from '../data/mock';
import { Avatar } from './Avatar';

interface DMItemProps {
  dm: DirectMessage;
  isSelected?: boolean;
  onSelect: (id: string) => void;
  onRemove: (e: React.MouseEvent, id: string) => void;
}

/**
 * Item individual da lista de conversas (Diretas / Grupos) na Sidebar:
 * - Avatar 32px circular com status (#1c9749 online, #8e919b offline/invisível) ou avatares duplos de grupo
 * - Item especial "Ludra" com badge roxo/lilás (#c77dff) "✓ OFICIAL"
 * - Ícone de coroa dourada (#ffc107) ao lado de líderes de grupo
 * - Hover e botão "X" para fechar a conversa à direita
 */
export const DMItem: React.FC<DMItemProps> = ({
  dm,
  isSelected = false,
  onSelect,
  onRemove,
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Conversa com ${dm.name}`}
      onClick={() => onSelect(dm.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(dm.id);
        }
      }}
      className={`group relative flex items-center justify-between px-2.5 py-2 mx-2 rounded-[6px] cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff] ${
        isSelected
          ? 'bg-white/[0.1] text-[#f0f1f7]'
          : 'text-[#8e919b] hover:bg-white/[0.06] hover:text-[#d0d1d7]'
      }`}
    >
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        <Avatar
          src={dm.avatarUrl}
          secondarySrc={dm.secondaryAvatarUrl}
          alt={dm.name}
          size="sm"
          status={dm.isGroup ? undefined : dm.status}
          isGroup={dm.isGroup}
          isOfficialLudra={dm.isOfficial}
          bgColor={dm.avatarBg}
          borderColor="#0d0d0d"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 min-w-0">
              <span
                className={`text-[14px] font-semibold truncate leading-5 ${
                  isSelected
                    ? 'text-[#f0f1f7]'
                    : 'text-[#d0d1d7] group-hover:text-[#f0f1f7]'
                }`}
              >
                {dm.name}
              </span>

              {/* Badge lilás "✓ OFICIAL" para o item Ludra */}
              {dm.isOfficial && (
                <span className="inline-flex items-center space-x-0.5 bg-[#c77dff] text-[#0d0d0d] text-[10px] font-extrabold px-1 py-[1px] rounded-[3px] leading-tight flex-shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                  <span>OFICIAL</span>
                </span>
              )}

              {/* Ícone de coroa dourada para líderes de grupo */}
              {dm.hasCrown && (
                <Crown
                  className="w-3.5 h-3.5 text-[#ffc107] fill-[#ffc107] flex-shrink-0"
                  aria-label="Dono do grupo"
                />
              )}
            </div>

            {dm.timestamp && (
              <span className="text-[11px] text-[#8e919b] group-hover:hidden ml-2 flex-shrink-0">
                {dm.timestamp}
              </span>
            )}
          </div>

          {dm.subtitle && (
            <p className="text-[12px] text-[#8e919b] truncate leading-4">
              {dm.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Botão "X" para fechar a DM à direita no hover */}
      <button
        type="button"
        aria-label={`Fechar conversa com ${dm.name}`}
        onClick={(e) => onRemove(e, dm.id)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-[#8e919b] hover:text-[#f0f1f7] transition-opacity duration-150 rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff] flex-shrink-0 ml-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
