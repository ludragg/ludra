import React from 'react';
import { MessageSquare, MoreVertical, Gamepad2, UserMinus, Ban } from 'lucide-react';
import type { Friend } from '../data/mock';
import { Avatar } from './Avatar';

interface FriendRowProps {
  friend: Friend;
}

/**
 * Linha individual da lista de amigos:
 * - Avatar 40px + indicador online/offline (#1c9749 / #8e919b)
 * - Nome em negrito (#f0f1f7), status abaixo com bolinha verde do Ludra ou ícone de controle + "VALORANT"
 * - À direita: botões circulares na estética do Ludra (Mensagem, Remover amigo, Bloquear e Mais opções)
 */
export const FriendRow: React.FC<FriendRowProps> = ({ friend }) => {
  return (
    <div
      role="listitem"
      className="group relative flex items-center justify-between px-3 py-2.5 -mx-2 rounded-[8px] border-t border-white/[0.06] hover:border-transparent hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer"
    >
      {/* Esquerda: Avatar 40px + Nome + Status */}
      <div className="flex items-center space-x-3.5 min-w-0">
        <Avatar
          src={friend.avatarUrl}
          alt={friend.name}
          size="md"
          status={friend.status}
          borderColor="#121212"
        />

        <div className="min-w-0">
          <div className="flex items-center space-x-1.5">
            <span className="text-[14px] font-bold text-[#f0f1f7] truncate leading-5">
              {friend.name}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 text-[12px] text-[#8e919b] truncate leading-4 mt-0.5">
            {friend.activityType === 'game' ? (
              <>
                <Gamepad2
                  className="w-3.5 h-3.5 text-[#c77dff] flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">
                  Jogando <strong className="font-semibold text-[#d0d1d7]">{friend.statusText}</strong>
                </span>
              </>
            ) : (
              <>
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    friend.status === 'online'
                      ? 'bg-[#1c9749]'
                      : 'border-[1.5px] border-[#8e919b]'
                  }`}
                />
                <span className="truncate">{friend.statusText}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Direita: Botões circulares de ação com a estética do Ludra + menu estilo Discord */}
      <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
        <button
          type="button"
          aria-label={`Enviar mensagem para ${friend.name}`}
          title="Mensagem"
          onClick={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.06] text-[#d0d1d7] hover:text-[#f0f1f7] flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label={`Remover ${friend.name}`}
          title="Desfazer amizade"
          onClick={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-[#801d1e]/40 border border-white/[0.06] text-[#d0d1d7] hover:text-[#f6746b] flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          <UserMinus className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label={`Bloquear ${friend.name}`}
          title="Bloquear"
          onClick={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-[#801d1e]/40 border border-white/[0.06] text-[#d0d1d7] hover:text-[#f6746b] flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          <Ban className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label={`Mais opções para ${friend.name}`}
          title="Mais opções"
          onClick={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.06] text-[#8e919b] hover:text-[#f0f1f7] flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
