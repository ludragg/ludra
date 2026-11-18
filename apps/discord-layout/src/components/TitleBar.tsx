import React from 'react';
import { Minus, Square, X } from 'lucide-react';

/**
 * Barra de título superior nativa do Ludra (32px de altura, fundo #0d0d0d):
 * - Logo oficial do dragão Ludra (18x18px)
 * - Nome "Ludra" em fonte Space Grotesk + badge "v0.2.3"
 * - Botões de janela à direita: minimizar, maximizar e fechar
 */
export const TitleBar: React.FC = () => {
  return (
    <header className="h-[32px] bg-[#0d0d0d] border-b border-white/[0.08] flex items-center justify-between select-none flex-shrink-0 z-40">
      {/* Identidade visual do Ludra à esquerda */}
      <div className="h-full px-3 flex items-center space-x-2">
        <img
          src="/ludra-logo.png"
          alt="Ludra"
          className="w-[18px] h-[18px] object-contain"
          draggable={false}
        />
        <span
          className="text-[13px] font-semibold text-[#d0d1d7] leading-none translate-y-[0.5px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Ludra
        </span>
        <span className="px-1.5 py-[2px] rounded-[4px] bg-white/[0.04] border border-white/[0.08] text-[10px] font-semibold leading-none text-[#8e919b] translate-y-[1px]">
          v0.2.3
        </span>
      </div>

      {/* Controles de janela à direita */}
      <div className="h-full flex items-center">
        <button
          type="button"
          aria-label="Minimizar"
          className="w-[46px] h-full flex items-center justify-center text-[#8e919b] hover:bg-white/[0.08] hover:text-[#f0f1f7] transition-colors duration-100 focus:outline-none"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximizar"
          className="w-[46px] h-full flex items-center justify-center text-[#8e919b] hover:bg-white/[0.08] hover:text-[#f0f1f7] transition-colors duration-100 focus:outline-none"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          aria-label="Fechar"
          className="w-[46px] h-full flex items-center justify-center text-[#8e919b] hover:bg-[#e11d48] hover:text-white transition-colors duration-100 focus:outline-none"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
