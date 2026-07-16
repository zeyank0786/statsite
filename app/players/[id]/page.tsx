'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Avatar from '@/components/Avatar';
import RadarChart from '@/components/RadarChart';
import AchievementBadge, { AchievementData } from '@/components/AchievementBadge';
import StatDescriptionModal from '@/components/StatDescriptionModal';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';
import { getUserColorHex } from '@/lib/userColors';
import { orderCategories, getCategoryMeta, getValueColor, scaleMax } from '@/lib/categories';
import LockBadge from '@/components/LockBadge';
import TierBadge from '@/components/TierBadge';
import {
  CompareIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  ChevronLeftIcon,
  TrendUpIcon,
  TrendDownIcon,
} from '@/components/icons';

interface Stat {
  id: string;
  code: string;
  label: string;
  value: number;
  locked?: boolean;
  lockSource?: 'override' | 'rules' | null;
  lockReasons?: any[];
}

interface Category {
  code: string;
  label: string;
  stats: Stat[];
}

interface HistoryEntry {
  oldValue: number;
  newValue: number;
  code: string;
  label: string;
  createdAt: string;
  changedBy: string;
}

interface ReviewSession {
  id: string;
  createdAt: string;
  participantCount: number;
}

export default function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = use(params);
  const { status, data: sessionData } = useSession();
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [email, setEmail] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallScore, setOverallScore] = useState<number | string>(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [recentReviews, setRecentReviews] = useState<ReviewSession[]>([]);
  const [rankUp, setRankUp] = useState<
    { statId: string; code: string; label: string; current: number; nextTier: string; nextTierHex: string; ptsToGo: number; weeks: number }[]
  >([]);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [changes, setChanges] = useState<Record<string, any>>({});
  const [colorCodeEnabled, setColorCodeEnabled] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'total'>('default');
  const [sortAscending, setSortAscending] = useState(true);
  const [notes, setNotes] = useState<Record<string, any[]>>({});
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [showAllAchievements, setShowAllAchievements] = useState(false);

  const currentPlayerId = (sessionData?.user as any)?.playerId;
  const isOwnProfile = currentPlayerId === playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadPlayerData();
    }
  }, [status, router, playerId]);

  const loadPlayerData = async () => {
    try {
      const [profileRes, changesRes, notesRes, achRes] = await Promise.all([
        fetch(`/api/players/${playerId}`),
        fetch(`/api/players/${playerId}/changes`),
        fetch(`/api/players/${playerId}/notes`),
        fetch(`/api/achievements?playerId=${playerId}`),
      ]);

      if (!profileRes.ok) {
        router.push('/players');
        return;
      }

      const data = await profileRes.json();
      setPlayerName(data.player.username);
      setEmail(data.player.email || 'No email set');
      setCreatedAt(data.player.createdAt);
      setCategories(data.categories);
      setOverallScore(data.overallScore);
      setHistory(data.history || []);
      setRecentReviews(data.recentReviews || []);
      setRankUp(data.rankUp || []);
      setStreakWeeks(data.streakWeeks || 0);
      setNewName(data.player.username);

      if (changesRes.ok) {
        const changesData = await changesRes.json();
        const changesMap: Record<string, any> = {};
        changesData.forEach((change: any) => {
          changesMap[change.code] = change;
        });
        setChanges(changesMap);
      }

      if (notesRes.ok) {
        const notesData = await notesRes.json();
        const notesMap: Record<string, any[]> = {};
        notesData.forEach((note: any) => {
          if (!notesMap[note.statId]) notesMap[note.statId] = [];
          notesMap[note.statId].push(note);
        });
        setNotes(notesMap);
      }

      if (achRes.ok) {
        const achData = await achRes.json();
        setAchievements(achData.achievements || []);
      }
    } catch (error) {
      console.error('Failed to load player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSortedStats = (stats: Stat[]) => {
    if (sortBy === 'default') return stats;
    const sorted = [...stats];
    if (sortBy === 'name') {
      const nameSorted = sorted.sort((a, b) => a.code.localeCompare(b.code));
      return sortAscending ? nameSorted : nameSorted.reverse();
    }
    return sorted.sort((a, b) => b.value - a.value);
  };

  const handleSaveName = async () => {
    if (!newName.trim() || newName === playerName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/players/${playerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newName }),
      });
      if (res.ok) {
        setPlayerName(newName);
        setEditingName(false);
      }
    } catch (error) {
      console.error('Failed to save name:', error);
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteNote = async (noteId: string, sessionId: string) => {
    if (!confirm('Delete this note? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      if (res.ok) {
        setNotes((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((statId) => {
            updated[statId] = updated[statId].filter((n: any) => n.id !== noteId);
          });
          return updated;
        });
        setDeletingNoteId(null);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <div className="glass h-64 animate-pulse mb-6" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  const orderedCategories = orderCategories(categories);
  const hex = getUserColorHex(playerId);
  const earned = achievements.filter((a) => a.earned);
  const radarLabels = orderedCategories.map((c) => getCategoryMeta(c.code).short);
  const radarColors = orderedCategories.map((c) => getCategoryMeta(c.code).hex);
  // Category totals as ratios — the strongest category defines the outer edge
  const radarValues = orderedCategories.map((c) => c.stats.reduce((s, st) => s + st.value, 0));

  return (
    <AppShell>
      <Link
        href="/players"
        className="inline-flex items-center gap-1 text-sm font-medium mb-5 hover:underline"
        style={{ color: 'var(--accent-cyan)' }}
      >
        <ChevronLeftIcon size={15} />
        All players
      </Link>

      {/* ===== Profile hero ===== */}
      <section className="glass card-shadow-lg relative overflow-hidden p-6 md:p-8 mb-6 animate-rise">
        <div
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ backgroundColor: hex }}
        />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <Avatar id={playerId} name={playerName} size={64} ring />
              <div className="min-w-0">
                {editingName ? (
                  <div className="flex gap-2 items-center flex-wrap">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="field max-w-[220px] py-2"
                      autoFocus
                    />
                    <button onClick={handleSaveName} disabled={savingName} className="btn-primary py-2 px-3">
                      <CheckIcon size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false);
                        setNewName(playerName);
                      }}
                      className="btn-ghost py-2 px-3"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <h1 className="font-display text-3xl md:text-4xl font-bold text-white truncate">
                      {playerName}
                    </h1>
                    {isOwnProfile && (
                      <button
                        onClick={() => setEditingName(true)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
                        title="Edit name"
                      >
                        <PencilIcon size={16} />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {email} · joined {createdAt ? new Date(createdAt).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>

            <div className="flex items-end gap-6 flex-wrap">
              <div>
                <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Overall Score
                </p>
                <p className="font-display text-5xl md:text-6xl font-bold leading-none" style={{ color: hex }}>
                  {overallScore}
                </p>
              </div>
              {streakWeeks > 0 && (
                <div className="pb-1">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border"
                    style={{ borderColor: 'rgba(249,115,22,0.5)', background: 'rgba(249,115,22,0.1)', color: 'var(--accent-orange)' }}
                    title="Consecutive weeks with a stat change or evidence post"
                  >
                    🔥 {streakWeeks}-week streak
                  </span>
                </div>
              )}
              <div className="flex gap-2 pb-1 flex-wrap">
                {!isOwnProfile && (
                  <Link href={`/compare?a=${currentPlayerId}&b=${playerId}`} className="btn-gradient text-sm">
                    <CompareIcon size={15} />
                    Compare with you
                  </Link>
                )}
                {isOwnProfile && (
                  <Link href="/targets" className="btn-ghost text-sm">
                    Set targets
                  </Link>
                )}
              </div>
            </div>

            {/* Achievements */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Achievements
                </p>
                <span className="text-xs font-bold" style={{ color: hex }}>
                  {earned.length}/{achievements.length}
                </span>
                <button
                  onClick={() => setShowAllAchievements(!showAllAchievements)}
                  className="text-xs font-semibold hover:underline ml-auto"
                  style={{ color: 'var(--accent-cyan)' }}
                >
                  {showAllAchievements ? 'Show earned only' : 'Show all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(showAllAchievements ? achievements : earned).map((a) => (
                  <AchievementBadge key={a.id} achievement={a} compact />
                ))}
                {earned.length === 0 && !showAllAchievements && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    No badges earned yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Radar */}
          <div className="w-full max-w-[300px] mx-auto lg:mx-0">
            <RadarChart
              labels={radarLabels}
              labelColors={radarColors}
              series={[{ label: playerName, color: hex, values: radarValues }]}
              max={Math.max(...radarValues, 1)}
              size={300}
            />
          </div>
        </div>
      </section>

      {/* ===== Rank-up ETA ===== */}
      {rankUp.length > 0 && (
        <section className="glass card-shadow p-5 mb-6 animate-rise">
          <div className="flex items-center gap-2 mb-3">
            <TrendUpIcon size={16} />
            <h2 className="font-display text-lg font-bold text-white">Rank-up ETA</h2>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              at the last 60 days&apos; pace
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rankUp.map((r) => (
              <div
                key={r.statId}
                className="rounded-xl border p-3.5"
                style={{ borderColor: `${r.nextTierHex}55`, background: `${r.nextTierHex}0f` }}
              >
                <p className="text-sm font-semibold text-white truncate">{r.label}</p>
                <p className="text-[15px] font-bold mt-1" style={{ color: r.nextTierHex }}>
                  {r.weeks === 1 ? '~1 week' : `~${r.weeks} weeks`} to {r.nextTier}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {r.current} pts now · {r.ptsToGo} to go
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== Stats controls ===== */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <h2 className="font-display text-2xl font-bold text-white">Stats</h2>
        <div className="flex gap-1.5 items-center flex-wrap">
          {(['default', 'name', 'total'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${
                sortBy === key ? 'text-black' : 'text-neutral-400 hover:text-white'
              }`}
              style={sortBy === key ? { backgroundColor: 'var(--accent-cyan)' } : {}}
            >
              {key}
            </button>
          ))}
          {sortBy === 'name' && (
            <button
              onClick={() => setSortAscending(!sortAscending)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-black"
              style={{ backgroundColor: 'var(--accent-cyan)' }}
            >
              {sortAscending ? 'A→Z' : 'Z→A'}
            </button>
          )}
          <button
            onClick={() => setColorCodeEnabled(!colorCodeEnabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              colorCodeEnabled ? 'text-white' : 'text-neutral-400 hover:text-white'
            }`}
            style={{
              borderColor: colorCodeEnabled ? 'var(--accent-purple)' : 'var(--surface-border)',
              background: colorCodeEnabled ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
            }}
          >
            Traffic lights {colorCodeEnabled ? 'on' : 'off'}
          </button>
        </div>
      </div>

      {/* ===== Categories ===== */}
      <div className="space-y-6 mb-10">
        {orderedCategories.map((category, ci) => {
          const meta = getCategoryMeta(category.code);
          const total = category.stats.reduce((sum, s) => sum + s.value, 0);
          return (
            <section
              key={category.code}
              className="glass card-shadow p-5 md:p-7 animate-rise"
              style={{ animationDelay: `${Math.min(ci * 0.05, 0.3)}s` }}
            >
              <div className="flex items-center justify-between mb-6 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-1.5 h-9 rounded-full shrink-0" style={{ backgroundColor: meta.hex }} />
                  <div className="min-w-0">
                    <h3 className="font-display text-xl md:text-2xl font-bold text-white truncate">
                      {category.label}
                    </h3>
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: meta.hex }}>
                      {meta.short}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Total
                  </p>
                  <p className="text-xl md:text-2xl font-bold" style={{ color: meta.hex }}>
                    {total}
                    <span className="text-sm font-medium opacity-60"> pts</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {(() => {
                  const catMax = scaleMax(category.stats.map((s) => s.value));
                  return getSortedStats(category.stats).map((stat) => {
                  const change = changes[stat.code];
                  const diff =
                    change && change.lastReviewValue !== undefined && change.lastReviewValue !== null
                      ? stat.value - change.lastReviewValue
                      : null;
                  const valueColor = colorCodeEnabled ? getValueColor(stat.value) : meta.hex;

                  return (
                    <div
                      key={stat.id}
                      onClick={() => router.push(`/players/${playerId}/stats/${stat.id}`)}
                      className="rounded-2xl p-4 border transition hover:bg-white/[0.03] cursor-pointer"
                      title={`${stat.label} — history & details`}
                      style={{
                        borderColor: colorCodeEnabled ? valueColor : 'var(--surface-border)',
                        background: 'rgba(255,255,255,0.02)',
                        opacity: stat.locked ? 0.7 : 1,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-1">
                        <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                          {stat.code}
                        </p>
                        <span className="flex items-center gap-1">
                          {stat.locked && (
                            <LockBadge
                              reasons={stat.lockReasons || []}
                              source={stat.lockSource}
                              statLabel={stat.label}
                            />
                          )}
                          <StatDescriptionModal
                            statCode={stat.code}
                            statLabel={stat.label}
                            description={STAT_DESCRIPTIONS[stat.code] || 'No description available'}
                          />
                        </span>
                      </div>
                      <p className="text-xs font-medium mb-3 line-clamp-2 min-h-8 text-white">{stat.label}</p>
                      <div className="flex items-baseline gap-1 mb-2">
                        <p className="text-3xl font-bold font-display" style={{ color: valueColor }}>
                          {stat.value}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>pts</p>
                        {diff !== null && diff !== 0 && (
                          <span
                            className="ml-auto text-[11px] font-bold flex items-center gap-0.5"
                            style={{ color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                            title={`Was ${change.lastReviewValue} at last review`}
                          >
                            {diff > 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
                            {diff > 0 ? '+' : ''}
                            {diff}
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (stat.value / catMax) * 100)}%`, backgroundColor: valueColor }}
                        />
                      </div>
                      <div className="mt-2">
                        <TierBadge value={stat.value} />
                      </div>

                      {notes[stat.id] && notes[stat.id].length > 0 && (
                        <div className="border-t pt-2 mt-3" style={{ borderColor: 'var(--surface-border)' }}>
                          <p className="text-[10px] uppercase font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            Review notes
                          </p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {notes[stat.id].slice(0, 2).map((note: any) => (
                              <div
                                key={note.id}
                                className="rounded-lg px-2 py-1.5 text-[11px] border-l-2"
                                style={{ borderColor: 'var(--accent-purple)', background: 'rgba(168,85,247,0.06)' }}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-neutral-300">{note.reviewerName}</p>
                                    <p className="text-neutral-400 line-clamp-2">{note.content}</p>
                                    <p className="text-neutral-500 text-[9px] mt-0.5">
                                      {new Date(note.createdAt).toLocaleDateString()}
                                    </p>
                                  </div>
                                  {currentPlayerId === note.reviewerId && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteNote(note.id, note.sessionId);
                                      }}
                                      disabled={deletingNoteId === note.id}
                                      className="text-neutral-500 hover:text-red-400 transition shrink-0"
                                      title="Delete note"
                                    >
                                      <XIcon size={11} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {notes[stat.id].length > 2 && (
                              <p className="text-[10px] text-neutral-500 italic">
                                +{notes[stat.id].length - 2} more
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  });
                })()}
              </div>
            </section>
          );
        })}
      </div>

      {/* ===== History + reviews ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {history.length > 0 && (
          <section className="glass card-shadow p-6">
            <h2 className="font-display text-xl font-bold text-white mb-5">Recent Changes</h2>
            <div className="space-y-3">
              {history.map((entry, idx) => {
                const up = entry.newValue > entry.oldValue;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 pb-3 border-b last:border-0 last:pb-0"
                    style={{ borderColor: 'var(--surface-border)' }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-white text-sm truncate">{entry.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        by {entry.changedBy} · {new Date(entry.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-sm shrink-0 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {entry.oldValue}{' '}
                      <span style={{ color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        → {entry.newValue}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {recentReviews.length > 0 && (
          <section className="glass card-shadow p-6">
            <h2 className="font-display text-xl font-bold text-white mb-5">Recent Reviews</h2>
            <div className="space-y-3">
              {recentReviews.map((review) => (
                <Link
                  key={review.id}
                  href={`/reviews/sessions/${review.id}`}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-xl border glass-hover"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {review.participantCount} participant{review.participantCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent-cyan)' }}>
                    Open →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
