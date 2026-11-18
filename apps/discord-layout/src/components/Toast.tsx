import React from 'react';
import { Scissors, MoreHorizontal, X } from 'lucide-react';

interface ToastProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Toast de notificação flutuante no canto inferior direito (~360px):
 * - Área de preview superior escura simulando captura da tela do Ludra
 * - Rodapé contendo: ícone do app (#c77dff) + "Ferramenta de Captura", botões "..." e "X"
 * - Texto: "O texto foi copiado para a área de transferência. Salvo automaticamente na pasta de capturas de tela."
 * - Botão "Marcar e compartilhar" de largura total
 */
export const Toast: React.FC<ToastProps> = ({ visible, onClose }) => {
  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Notificação da Ferramenta de Captura"
      className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-[8px] overflow-hidden bg-[#121212] border border-white/[0.12] shadow-[0_12px_32px_rgba(0,0,0,0.85)] text-[#f0f1f7] select-none animate-toast-in"
    >
      {/* Área de preview superior escura */}
      <div className="h-[124px] bg-[#09090b] relative overflow-hidden border-b border-white/[0.08] flex items-center justify-center px-6">
        {/* Miniatura simulando uma captura de tela escura do Ludra */}
        <div className="w-full h-[90px] rounded-[6px] bg-[#0d0d0d] border border-white/[0.08] flex overflow-hidden shadow-md opacity-95">
          <div className="w-4 bg-[#09090b] border-r border-white/[0.06] flex flex-col items-center py-1.5 space-y-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c77dff]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#18181b]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#18181b]" />
          </div>
          <div className="w-14 bg-[#0d0d0d] border-r border-white/[0.06] p-1.5 space-y-1">
            <div className="h-1.5 w-full bg-white/[0.12] rounded" />
            <div className="h-1.5 w-8 bg-white/[0.06] rounded" />
            <div className="h-1.5 w-10 bg-white/[0.06] rounded" />
          </div>
          <div className="flex-1 bg-[#121212] p-2 space-y-1.5">
            <div className="flex items-center space-x-1">
              <div className="h-2 w-12 bg-white/[0.12] rounded" />
              <div className="h-2 w-10 bg-[#c77dff] rounded" />
            </div>
            <div className="h-2 w-full bg-[#0d0d0d] rounded" />
            <div className="flex items-center space-x-1.5 pt-1">
              <span className="w-3.5 h-3.5 rounded-full bg-[#1c9749]" />
              <div className="h-1.5 w-16 bg-[#8e919b]/50 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Corpo / Rodapé da notificação */}
      <div className="p-3.5 bg-[#121212]">
        {/* Linha de topo: Ícone + "Ferramenta de Captura" + botões "..." e "X" */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 rounded bg-[#c77dff] flex items-center justify-center text-[#0d0d0d]">
              <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-[#d0d1d7]">
              Ferramenta de Captura
            </span>
          </div>

          <div className="flex items-center space-x-1 text-[#8e919b]">
            <button
              type="button"
              aria-label="Mais opções da notificação"
              className="p-1 rounded hover:bg-white/[0.08] hover:text-[#f0f1f7] transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Fechar notificação"
              onClick={onClose}
              className="p-1 rounded hover:bg-white/[0.08] hover:text-[#f0f1f7] transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Texto descritivo */}
        <p className="text-[12.5px] text-[#d0d1d7] leading-snug mb-3">
          O texto foi copiado para a área de transferência. Salvo
          automaticamente na pasta de capturas de tela.
        </p>

        {/* Botão "Marcar e compartilhar" de largura total */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-1.5 px-3 rounded-[6px] bg-[#18181b] hover:bg-white/[0.1] text-[#f0f1f7] text-xs font-semibold text-center transition-colors duration-150 border border-white/[0.1] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c77dff]"
        >
          Marcar e compartilhar
        </button>
      </div>
    </div>
  );
};
