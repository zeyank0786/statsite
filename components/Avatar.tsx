'use client';

import { getUserColorHex, getUserColorBg, getInitials } from '@/lib/userColors';

interface AvatarProps {
  id: string;
  name: string;
  size?: number;
  ring?: boolean;
  className?: string;
}

export default function Avatar({ id, name, size = 40, ring = false, className = '' }: AvatarProps) {
  const hex = getUserColorHex(id);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${hex}, ${hex}99)`,
        boxShadow: ring
          ? `0 0 0 2px var(--background), 0 0 0 4px ${hex}66`
          : `0 2px 10px ${getUserColorBg(id, 0.35)}`,
      }}
      title={name}
    >
      {getInitials(name)}
    </span>
  );
}
