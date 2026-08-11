'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import RecallGame from '@/components/training/RecallGame';
import DeduceGame from '@/components/training/DeduceGame';
import FocusGame from '@/components/training/FocusGame';
import ReflexGame from '@/components/training/ReflexGame';
import { getUserColorHex } from '@/lib/userColors';
import { CheckIcon, LightbulbIcon, TrophyIcon, XIcon } from '@/components/icons';

/**
 * The Training Facility.
 *
 * Games keep their own scores and boards — nothing here moves a stat on its
 * own. A run worth points becomes a normal suggestion someone else files, so
 * the crew still decides, and the drills can't be farmed.
 */

interface Game {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  statCategoryCode: string;
  scoreLabel: string;
  emoji: string;
  hex: string;
}

interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  best: number;
  runs: number;
  rank: number;
}

interface Result {
  id: string;
  playerId: string;
  playerName: string;
  gameId: string;
  score: number;
  createdAt: string;
}

interface RunOutcome {
  score: number;
  personalBest: boolean;
  crewRecord: boolean;
  previousBest: number | null;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function TrainingPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const currentPlayerId = String((session?.user as { playerId?: string } | undefined)?.playerId || '');

  const [games, setGames] = useState<Game[]>([]);
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardEntry[]>>({});
  const [recent, setRecent] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Game | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const res = await fetch('/api/training');
      if (!res.ok) return;
      const data = await res.json();
      setGames(data.games || []);
      setLeaderboards(data.leaderboards || {});
      setRecent(data.recent || []);
    } catch {
      /* the board is not worth an error banner */
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRun = async (game: Game, score: number) => {
    try {
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, score }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to record the run');
        return;
      }
      setOutcome({
        score,
        personalBest: Boolean(data.personalBest),
        crewRecord: Boolean(data.crewRecord),
        previousBest: data.previousBest ?? null,
      });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record the run');
    }
  };

  const closeGame = () => {
    setPlaying(null);
    setOutcome(null);
  };

  return (
    <AppShell>
      <PageHeader
        title="Training Facility"
        subtitle="Drills with their own records. Nothing here moves a stat by itself."
        eyebrow="Practice"
        eyebrowColor="var(--accent-purple)"
      />

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mb-5">
          {error}
        </div>
      )}

      <div
        className="rounded-xl px-4 py-3 text-xs mb-6 border flex items-start gap-2.5"
        style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
      >
        <LightbulbIcon size={15} className="shrink-0 mt-0.5" />
        <p>
          Scores here are their own thing — they never award points automatically. If someone puts up
          a run that deserves it, a crewmate proposes the stat change and everyone votes, same as
          always.
        </p>
      </div>

      {loading ? (
        <div className="glass h-64 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {games.map((game) => {
            const board = leaderboards[game.id] || [];
            const mine = board.find((e) => e.playerId === currentPlayerId);
            return (
              <section key={game.id} className="glass card-shadow p-5 animate-rise">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl shrink-0">{game.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold text-white">{game.name}</h2>
                    <p className="text-xs" style={{ color: game.hex }}>
                      {game.tagline}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setPlaying(game);
                      setOutcome(null);
                    }}
                    className="btn-gradient text-sm px-4 py-2 shrink-0"
                  >
                    Play
                  </button>
                </div>

                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {game.description}
                </p>

                {board.length === 0 ? (
                  <p className="text-xs py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                    No runs yet — set the first record.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {board.slice(0, 5).map((entry) => (
                      <div key={entry.playerId} className="flex items-center gap-2.5">
                        <span className="w-6 text-center text-sm shrink-0">
                          {entry.rank <= 3 ? MEDAL[entry.rank - 1] : entry.rank}
                        </span>
                        <Avatar id={entry.playerId} name={entry.playerName} size={24} />
                        <span className="text-sm text-neutral-200 min-w-0 truncate flex-1">
                          {entry.playerName}
                          {entry.playerId === currentPlayerId && (
                            <span className="text-[10px] ml-1.5" style={{ color: 'var(--text-secondary)' }}>
                              you
                            </span>
                          )}
                        </span>
                        <span
                          className="text-sm font-bold tabular-nums shrink-0"
                          style={{ color: getUserColorHex(entry.playerId) }}
                        >
                          {entry.best}
                        </span>
                        {/* Only a crewmate can propose for someone — never yourself. */}
                        {entry.playerId !== currentPlayerId && entry.rank === 1 && (
                          <Link
                            href={`/suggestions/new?subject=${entry.playerId}&reason=${encodeURIComponent(
                              `Holds the crew record in ${game.name} (${entry.best} ${game.scoreLabel}) in the training facility.`
                            )}`}
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg shrink-0 transition hover:bg-white/5"
                            style={{ color: 'var(--accent-purple)' }}
                            title="Propose a stat change off the back of this"
                          >
                            Propose
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {mine && (
                  <p className="text-[11px] mt-3 pt-3 border-t" style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}>
                    Your best: <span className="text-white font-semibold">{mine.best}</span> {game.scoreLabel} over{' '}
                    {mine.runs} run{mine.runs === 1 ? '' : 's'}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Recent runs across the crew */}
      {recent.length > 0 && (
        <section className="glass card-shadow p-5 mt-6 animate-rise">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
            Latest runs
          </p>
          <div className="space-y-1">
            {recent.slice(0, 10).map((r) => {
              const game = games.find((g) => g.id === r.gameId);
              return (
                <div key={r.id} className="flex items-center gap-2.5 text-sm">
                  <span className="shrink-0">{game?.emoji || '•'}</span>
                  <Avatar id={r.playerId} name={r.playerName} size={20} />
                  <span className="text-neutral-300 min-w-0 truncate">
                    {r.playerName} · {game?.name || r.gameId}
                  </span>
                  <span className="ml-auto font-bold tabular-nums shrink-0" style={{ color: game?.hex }}>
                    {r.score}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Game modal */}
      {playing && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border p-6 animate-rise"
            style={{ background: 'rgba(14,14,20,0.99)', borderColor: `${playing.hex}55` }}
          >
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{playing.emoji}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-bold text-white">{playing.name}</h2>
                <p className="text-xs" style={{ color: playing.hex }}>
                  {playing.tagline}
                </p>
              </div>
              <button
                onClick={closeGame}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition shrink-0"
                aria-label="Close"
              >
                <XIcon size={18} />
              </button>
            </div>

            {outcome ? (
              <div className="text-center py-6">
                <p className="text-5xl mb-3">{outcome.crewRecord ? '🏆' : outcome.personalBest ? '🎉' : '✅'}</p>
                <p className="font-display text-4xl font-bold mb-1" style={{ color: playing.hex }}>
                  {outcome.score}
                </p>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {playing.scoreLabel}
                </p>
                <p className="text-sm text-white mb-5">
                  {outcome.crewRecord
                    ? 'Crew record. Nobody has beaten that.'
                    : outcome.personalBest
                    ? `Personal best${outcome.previousBest !== null ? ` — up from ${outcome.previousBest}` : ''}.`
                    : `Logged. Your best is still ${outcome.previousBest}.`}
                </p>
                {(outcome.crewRecord || outcome.personalBest) && (
                  <p
                    className="text-xs rounded-xl px-3.5 py-2.5 border mb-4 flex items-center gap-2 justify-center"
                    style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
                  >
                    <TrophyIcon size={14} />
                    On the board — a crewmate can propose points off it.
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setOutcome(null)} className="btn-gradient flex-1 py-2.5">
                    Go again
                  </button>
                  <button onClick={closeGame} className="btn-ghost px-5">
                    <CheckIcon size={15} />
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                {playing.id === 'recall' && <RecallGame onFinish={(s) => submitRun(playing, s)} />}
                {playing.id === 'deduce' && <DeduceGame onFinish={(s) => submitRun(playing, s)} />}
                {playing.id === 'focus' && <FocusGame onFinish={(s) => submitRun(playing, s)} />}
                {playing.id === 'reflex' && <ReflexGame onFinish={(s) => submitRun(playing, s)} />}
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
