import React, { useState } from 'react';
import { MicOff, Mic, Headphones, Settings, ChevronDown } from 'lucide-react';
import type { CurrentUser } from '../data/mock';
import { Avatar } from './Avatar';

interface UserPanelProps {
  user: CurrentUser;
}

/**
 * Painel fixo do usuário no rodapé da Sidebar (52px de altura).
 * Mescla o visual característico do Ludra (avatar com inicial 'F' verde-água #1c9778,
 * nome 'felikovizk' e indicador 'Invisível' com círculo vazado) aos controles
 * completos do rodapé estilo Discord (microfone mutado em vermelho #e11d48 com seta,
 * fone de ouvido com seta e engrenagem de configurações).
 */
export const UserPanel: React.FC<UserPanelProps> = ({ user }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);

  return (
    <div className="p-2 bg-[#09090b] border-t border-white/[0.08] flex-shrink-0 select-none">
      <div className="h-[46px] bg-white/[0.04] border border-white/[0.06] rounded-[6px] px-2 flex items-center justify-between">
        {/* Perfil do usuário clicável */}
        <button
          type="button"
          aria-label={`Perfil de ${user.displayName}, status ${user.statusLabel}`}
          className="flex items-center space-x-2.5 p-1 -ml-0.5 rounded-[4px] hover:bg-white/[0.06] transition-colors duration-150 min-w-0 flex-1 mr-1 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          <Avatar
            src={user.avatarUrl}
            initials={user.initials}
            bgColor={user.avatarBg}
            alt={user.displayName}
            size="sm"
            status={user.status}
            borderColor="#121214"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-semibold text-[#f0f1f7] truncate">
              {user.stylizedName}
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-[#8e919b] truncate mt-0.5">
              <span className="w-2 h-2 rounded-full border-[1.5px] border-[#8e919b] inline-block flex-shrink-0" />
              <span>{user.statusLabel}</span>
            </div>
          </div>
        </button>

        {/* Botões de controle de voz e configurações */}
        <div className="flex items-center space-x-0.5 text-[#8e919b]">
          {/* Botão de Microfone Mutado (vermelho #e11d48) + seta dropdown */}
          <div className="flex items-center rounded-[4px] hover:bg-white/[0.08] transition-colors duration-150">
            <button
              type="button"
              aria-label={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
              title={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-l-[4px] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
            >
              {isMuted ? (
                <MicOff className="w-[16px] h-[16px] text-[#e11d48]" />
              ) : (
                <Mic className="w-[16px] h-[16px] text-[#d0d1d7] hover:text-[#f0f1f7]" />
              )}
            </button>
            <button
              type="button"
              aria-label="Opções de entrada de áudio"
              className="pr-1 py-1.5 text-[#8e919b] hover:text-[#f0f1f7] focus:outline-none"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Botão de Fone de Ouvido + seta dropdown */}
          <div className="flex items-center rounded-[4px] hover:bg-white/[0.08] transition-colors duration-150">
            <button
              type="button"
              aria-label={isDeafened ? 'Ativar áudio' : 'Desativar áudio'}
              title={isDeafened ? 'Ativar áudio' : 'Desativar áudio'}
              onClick={() => setIsDeafened(!isDeafened)}
              className="p-1.5 rounded-l-[4px] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
            >
              <Headphones
                className={`w-[16px] h-[16px] ${
                  isDeafened
                    ? 'text-[#e11d48]'
                    : 'text-[#8e919b] hover:text-[#f0f1f7]'
                }`}
              />
            </button>
            <button
              type="button"
              aria-label="Opções de saída de áudio"
              className="pr-1 py-1.5 text-[#8e919b] hover:text-[#f0f1f7] focus:outline-none"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Botão de Configurações de Usuário (engrenagem) */}
          <button
            type="button"
            aria-label="Configurações de Usuário"
            title="Configurações de Usuário"
            className="p-1.5 rounded-[4px] hover:bg-white/[0.08] text-[#8e919b] hover:text-[#f0f1f7] transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
          >
            <Settings className="w-[16px] h-[16px]" />
          </button>
        </div>
      </div>
    </div>
  );
};
