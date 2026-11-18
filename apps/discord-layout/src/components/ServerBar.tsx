import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ServerItem } from '../data/mock';

interface ServerBarProps {
  servers: ServerItem[];
  activeServerId: string;
  onSelectServer: (id: string) => void;
  onCreateGroup: () => void;
}

/**
 * Barra lateral esquerda de grupos/comunidades do Ludra (72px de largura):
 * - Topo: Botão Início (Amigos) com a logo oficial do dragão Ludra
 * - Linha divisória fina abaixo
 * - Lista dinâmica dos grupos que o próprio usuário criar (inicia vazia!)
 * - Botão "+" verde (#1c9749) para criar um grupo do zero
 */
export const ServerBar: React.FC<ServerBarProps> = ({
  servers,
  activeServerId,
  onSelectServer,
  onCreateGroup,
}) => {
  const [hoveredItem, setHoveredItem] = useState<{
    name: string;
    top: number;
  } | null>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, name: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredItem({
      name,
      top: rect.top + rect.height / 2,
    });
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
  };

  const isHomeActive = activeServerId === 'home';

  return (
    <nav
      aria-label="Seus grupos"
      className="w-[72px] h-full bg-[#09090b] border-r border-white/[0.08] flex flex-col items-center py-3 select-none flex-shrink-0 z-30 relative"
    >
      {/* Topo: Botão Amigos com a Logo Oficial do Dragão Ludra */}
      <div className="relative w-full flex items-center justify-center mb-2 group">
        {/* Indicador pill à esquerda */}
        <span
          className={`absolute left-0 w-1 bg-[#f0f1f7] rounded-r-full transition-all duration-150 ${
            isHomeActive
              ? 'h-10'
              : 'h-0 group-hover:h-5'
          }`}
        />

        <button
          type="button"
          aria-label="Amigos"
          onClick={() => onSelectServer('home')}
          onMouseEnter={(e) => handleMouseEnter(e, 'Amigos')}
          onMouseLeave={handleMouseLeave}
          className={`relative w-12 h-12 flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c77dff] ${
            isHomeActive
              ? 'bg-[#c77dff] rounded-[16px]'
              : 'bg-[#121212] hover:bg-[#c77dff] rounded-[24px] hover:rounded-[16px]'
          }`}
        >
          <img
            src="/ludra-logo.png"
            alt="Ludra"
            className="w-7 h-7 object-contain"
            draggable={false}
          />
        </button>
      </div>

      {/* Linha divisória fina abaixo */}
      <div className="w-8 h-[2px] bg-[#121212] rounded-full mb-2 flex-shrink-0" />

      {/* Lista vertical de grupos criados pelo usuário + botão Criar grupo */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar flex flex-col items-center space-y-2">
        {servers.map((srv) => {
          const isActive = activeServerId === srv.id;
          return (
            <div
              key={srv.id}
              className="relative w-full flex items-center justify-center group"
            >
              {/* Indicador pill à esquerda */}
              <span
                className={`absolute left-0 w-1 bg-[#f0f1f7] rounded-r-full transition-all duration-150 ${
                  isActive
                    ? 'h-10'
                    : srv.hasNotification
                    ? 'h-2 group-hover:h-5'
                    : 'h-0 group-hover:h-5'
                }`}
              />

              <button
                type="button"
                aria-label={srv.name}
                onClick={() => onSelectServer(srv.id)}
                onMouseEnter={(e) => handleMouseEnter(e, srv.name)}
                onMouseLeave={handleMouseLeave}
                className={`w-12 h-12 flex items-center justify-center overflow-hidden transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c77dff] ${
                  isActive
                    ? 'rounded-[16px] bg-[#c77dff] text-[#0d0d0d]'
                    : 'rounded-[24px] hover:rounded-[16px] bg-[#121212] hover:bg-[#c77dff] text-[#d0d1d7] hover:text-[#0d0d0d]'
                }`}
              >
                {srv.iconUrl ? (
                  <img
                    src={srv.iconUrl}
                    alt={srv.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span
                    className="text-[14px] font-bold tracking-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {srv.initials || srv.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* Botão "+" Criar grupo */}
        <div className="relative w-full flex items-center justify-center group">
          <button
            type="button"
            aria-label="Criar grupo"
            onClick={onCreateGroup}
            onMouseEnter={(e) => handleMouseEnter(e, 'Criar grupo')}
            onMouseLeave={handleMouseLeave}
            className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-[#121212] hover:bg-[#1c9749] text-[#1c9749] hover:text-white flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c77dff]"
          >
            <Plus className="w-[22px] h-[22px] transition-colors duration-150" />
          </button>
        </div>
      </div>

      {/* Tooltip flutuante à direita da barra de grupos */}
      {hoveredItem && (
        <div
          role="tooltip"
          style={{ top: hoveredItem.top }}
          className="fixed left-[84px] -translate-y-1/2 z-50 pointer-events-none bg-[#0d0d0d] border border-white/[0.1] text-[#f0f1f7] text-xs font-semibold px-3 py-1.5 rounded-md shadow-2xl whitespace-nowrap flex items-center"
        >
          <span className="absolute -left-1.5 w-2.5 h-2.5 bg-[#0d0d0d] border-l border-b border-white/[0.1] rotate-45 rounded-[1px]" />
          <span className="relative z-10">{hoveredItem.name}</span>
        </div>
      )}
    </nav>
  );
};
