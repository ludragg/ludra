import React from 'react';
import type { UserStatus } from '../data/mock';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  status?: UserStatus;
  borderColor?: string;
  secondarySrc?: string;
  isGroup?: boolean;
  isOfficialLudra?: boolean;
  initials?: string;
  bgColor?: string;
}

/**
 * Componente Avatar com paleta do Ludra:
 * - Online: verde #1c9749
 * - Offline / Invisível: cinza #8e919b com centro vazado
 * - Item oficial do Ludra: logo do dragão em fundo #18181b com borda #c77dff/30
 */
export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = 'md',
  status,
  borderColor = '#0d0d0d',
  secondarySrc,
  isGroup = false,
  isOfficialLudra = false,
  initials,
  bgColor = '#1c9778',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',      // 32px
    md: 'w-10 h-10',    // 40px
    lg: 'w-12 h-12',    // 48px
  };

  const badgeSizes = {
    sm: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5 border-[3px]',
    md: 'w-4 h-4 -bottom-0.5 -right-0.5 border-[3px]',
    lg: 'w-4 h-4 bottom-0 right-0 border-[3px]',
  };

  if (isGroup) {
    return (
      <div className="relative w-8 h-8 flex-shrink-0 select-none" aria-label={alt}>
        <img
          src={src}
          alt={alt}
          className="w-[22px] h-[22px] rounded-full object-cover absolute top-0 left-0"
        />
        <img
          src={secondarySrc || src}
          alt={`${alt} membro`}
          style={{ borderColor }}
          className="w-[22px] h-[22px] rounded-full object-cover absolute bottom-0 right-0 border-2"
        />
      </div>
    );
  }

  return (
    <div className={`relative flex-shrink-0 select-none ${sizeClasses[size]}`}>
      {isOfficialLudra ? (
        <div className="w-full h-full rounded-full bg-[#18181b] border border-[#c77dff]/40 flex items-center justify-center">
          <img
            src="/ludra-logo.png"
            alt="Ludra Oficial"
            className="w-5 h-5 object-contain"
            draggable={false}
          />
        </div>
      ) : src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-xs font-bold text-[#0d0d0d]"
          style={{ backgroundColor: bgColor }}
        >
          {initials || alt.slice(0, 1).toUpperCase()}
        </div>
      )}

      {status && (
        <span
          style={{ borderColor }}
          className={`absolute rounded-full flex items-center justify-center ${badgeSizes[size]} ${
            status === 'online' ? 'bg-[#1c9749]' : 'bg-[#8e919b]'
          }`}
          title={status === 'online' ? 'Online' : 'Invisível / Offline'}
        >
          {status !== 'online' && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: borderColor }}
            />
          )}
        </span>
      )}
    </div>
  );
};
