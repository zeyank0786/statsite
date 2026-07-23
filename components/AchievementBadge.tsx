'use client';

import React from 'react';
import {
  StarIcon,
  CrownIcon,
  MedalIcon,
  ShieldIcon,
  TargetIcon,
  TrendUpIcon,
  ZapIcon,
  FlameIcon,
  TrophyIcon,
  AwardIcon,
  CheckIcon,
  CameraIcon,
  LightbulbIcon,
  MessageIcon,
  HandIcon,
} from './icons';

export interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
  group?: string;
  earned: boolean;
  detail?: string;
}

const ICON_MAP: Record<string, { Icon: (p: any) => React.ReactNode; rgb: string }> = {
  star: { Icon: StarIcon, rgb: '251, 191, 36' },
  crown: { Icon: CrownIcon, rgb: '251, 191, 36' },
  medal: { Icon: MedalIcon, rgb: '249, 115, 22' },
  shield: { Icon: ShieldIcon, rgb: '59, 130, 246' },
  'shield-check': { Icon: ShieldIcon, rgb: '52, 211, 153' },
  target: { Icon: TargetIcon, rgb: '34, 211, 238' },
  'trending-up': { Icon: TrendUpIcon, rgb: '52, 211, 153' },
  zap: { Icon: ZapIcon, rgb: '168, 85, 247' },
  flame: { Icon: FlameIcon, rgb: '249, 115, 22' },
  trophy: { Icon: TrophyIcon, rgb: '251, 191, 36' },
  award: { Icon: AwardIcon, rgb: '236, 72, 153' },
  camera: { Icon: CameraIcon, rgb: '249, 115, 22' },
  lightbulb: { Icon: LightbulbIcon, rgb: '168, 85, 247' },
  message: { Icon: MessageIcon, rgb: '34, 211, 238' },
  hand: { Icon: HandIcon, rgb: '52, 211, 153' },
  check: { Icon: CheckIcon, rgb: '52, 211, 153' },
};

export default function AchievementBadge({
  achievement,
  compact = false,
}: {
  achievement: AchievementData;
  compact?: boolean;
}) {
  const { Icon, rgb } = ICON_MAP[achievement.icon] || ICON_MAP.star;
  const earned = achievement.earned;

  if (compact) {
    return (
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl border shrink-0"
        style={{
          background: earned ? `rgba(${rgb}, 0.15)` : 'rgba(255,255,255,0.03)',
          borderColor: earned ? `rgba(${rgb}, 0.45)` : 'var(--surface-border)',
          color: earned ? `rgb(${rgb})` : 'rgba(255,255,255,0.25)',
        }}
        title={`${achievement.name} — ${achievement.description}${earned ? ' ✓' : ' (locked)'}`}
      >
        <Icon size={19} />
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 p-3.5 rounded-2xl border transition"
      style={{
        background: earned ? `rgba(${rgb}, 0.08)` : 'rgba(255,255,255,0.02)',
        borderColor: earned ? `rgba(${rgb}, 0.35)` : 'var(--surface-border)',
        opacity: earned ? 1 : 0.55,
      }}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
        style={{
          background: earned ? `rgba(${rgb}, 0.2)` : 'rgba(255,255,255,0.04)',
          color: earned ? `rgb(${rgb})` : 'rgba(255,255,255,0.3)',
        }}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-white truncate">{achievement.name}</p>
          {earned && (
            <span style={{ color: `rgb(${rgb})` }}>
              <CheckIcon size={13} className="shrink-0" />
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {achievement.description}
        </p>
        {earned && achievement.detail && (
          <p className="text-[11px] mt-1 font-medium" style={{ color: `rgb(${rgb})` }}>
            {achievement.detail}
          </p>
        )}
      </div>
    </div>
  );
}
