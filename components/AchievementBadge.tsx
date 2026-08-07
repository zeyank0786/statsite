'use client';

import React, { useState } from 'react';
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
  SparklesIcon,
  ClockIcon,
  ScaleIcon,
  RadarIcon,
  GridIcon,
  LockIcon,
} from './icons';

export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';

export interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
  group?: string;
  rarity?: Rarity;
  earned: boolean;
  detail?: string;
  /** ISO date the sync first observed it; absent for back-filled rows */
  earnedAt?: string;
  /** Everyone in the crew currently holding it */
  holders?: string[];
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
  sparkles: { Icon: SparklesIcon, rgb: '236, 72, 153' },
  clock: { Icon: ClockIcon, rgb: '59, 130, 246' },
  scale: { Icon: ScaleIcon, rgb: '34, 211, 238' },
  radar: { Icon: RadarIcon, rgb: '168, 85, 247' },
  grid: { Icon: GridIcon, rgb: '59, 130, 246' },
};

const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  mythic: 'Mythic',
};

export default function AchievementBadge({
  achievement,
  compact = false,
}: {
  achievement: AchievementData;
  compact?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const { Icon, rgb } = ICON_MAP[achievement.icon] || ICON_MAP.star;
  const earned = achievement.earned;
  const rarity: Rarity = achievement.rarity || 'common';
  const holders = achievement.holders || [];

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

  const earnedOn = achievement.earnedAt
    ? new Date(achievement.earnedAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    // The tilt lives on the outer shell and the flip on the inner one. Both are
    // 3D transforms; on a single element the later one would simply replace the
    // other and the card would either never tilt or never turn over.
    <div className={`holo ${earned ? 'tilt' : ''}`} data-rarity={rarity} data-earned={earned}>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="holo-btn"
        aria-expanded={flipped}
        aria-label={`${achievement.name}. ${RARITY_LABEL[rarity]}. ${
          earned ? 'Earned' : 'Locked'
        }. Show details`}
      >
        {/* The grid lives on a div rather than the button: a button as a grid
            container has a patchy history across engines, and if it fell back
            to block the two faces would stack instead of overlapping. */}
        <div className="holo-inner" data-flipped={flipped}>
          {/* Both faces occupy the same grid cell, so the card is as tall as the
              taller side and nothing jumps mid-turn. */}
          <div className="holo-face holo-front">
            <span className="holo-foil" aria-hidden="true" />
            <span className="holo-glare" aria-hidden="true" />
            <div className="flex items-start gap-3 relative">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                style={{
                  background: earned ? `rgba(${rgb}, 0.2)` : 'rgba(255,255,255,0.04)',
                  color: earned ? `rgb(${rgb})` : 'rgba(255,255,255,0.3)',
                }}
              >
                {earned ? <Icon size={20} /> : <LockIcon size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-white truncate">{achievement.name}</p>
                  {earned && (
                    <span style={{ color: `rgb(${rgb})` }}>
                      <CheckIcon size={13} className="shrink-0" />
                    </span>
                  )}
                  <span className="holo-pip ml-auto shrink-0">{RARITY_LABEL[rarity]}</span>
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
          </div>

          <div className="holo-face holo-back">
            <span className="holo-foil" aria-hidden="true" />
            <div className="relative">
              <p className="holo-pip">{RARITY_LABEL[rarity]}</p>
              <p className="text-sm font-semibold text-white mt-2">{achievement.name}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                {earned
                  ? earnedOn
                    ? `Earned ${earnedOn}`
                    : 'Earned — before the trophy case started keeping dates'
                  : 'Not earned yet'}
              </p>
              <p
                className="text-[10px] uppercase font-bold tracking-wider mt-3 mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {holders.length === 0
                  ? 'Unclaimed'
                  : `Held by ${holders.length} of the crew`}
              </p>
              <p className="text-xs leading-snug text-white">
                {holders.length === 0 ? 'Nobody has this one yet.' : holders.join(' · ')}
              </p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
