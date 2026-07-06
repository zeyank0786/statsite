'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getUserColorHex } from '@/lib/userColors';
import { PencilIcon, EyeIcon, XIcon, PlusIcon } from '@/components/icons';

interface ReviewSession {
  id: string;
  targetPlayerId: string;
  playerName: string;
  status: string;
  createdAt: string;
  currentUserRole: string | null;
}

interface Player {
  id: string;
  username: string;
}

export default function ReviewsPage() {
  const { status, data: sessionData } = useSession();
  const router = useRouter();
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const currentPlayerId = (sessionData?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadData();
    }
  }, [status, router]);

  // Poll sessions every 1 second for real-time updates (but not while joining/closing)
  useEffect(() => {
    if (!currentPlayerId || status !== 'authenticated' || joining || closing) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/reviews/cycles');
        if (res.ok) setSessions(await res.json());
      } catch (error) {
        console.error('Failed to refresh sessions:', error);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentPlayerId, status, joining, closing]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sessionsRes, playersRes] = await Promise.all([
        fetch('/api/reviews/cycles'),
        fetch('/api/players'),
      ]);
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (playersRes.ok) setPlayers(await playersRes.json());
    } catch (error) {
      console.error('Failed to load review data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (playerId: string) => {
    if (currentPlayerId === playerId) {
      setCreateError('You cannot create a review session for your own stats');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/reviews/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      if (res.ok) {
        loadData();
      } else {
        const data = await res.json();
        setCreateError(data.error || 'Failed to create review session');
      }
    } catch (err: any) {
      setCreateError(err.message || 'An error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    setClosing(sessionId);
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revert' }),
      });
      if (res.ok) {
        loadData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to close session');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setClosing(null);
    }
  };

  const handleJoin = async (sessionId: string, role: 'editor' | 'reviewer') => {
    setJoining(sessionId);
    setJoinError(null);
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        await loadData();
      } else {
        const data = await res.json();
        setJoinError(data.error || 'Failed to join session');
      }
    } catch (err: any) {
      setJoinError(err.message || 'An error occurred');
    } finally {
      setJoining(null);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader title="Reviews" eyebrow="Live Sessions" eyebrowColor="var(--accent-pink)" />
        <div className="glass h-48 animate-pulse mb-6" />
        <div className="glass h-32 animate-pulse" />
      </AppShell>
    );
  }

  if (!currentPlayerId) {
    return (
      <AppShell>
        <div className="glass card-shadow text-center py-20 px-6">
          <p className="text-red-400 font-semibold mb-2">No player ID found in session</p>
          <p style={{ color: 'var(--text-secondary)' }}>Please sign out and sign back in.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Collaborative Reviews"
        subtitle="Live sessions where the crew reviews one player's stats together."
        eyebrow="Live Sessions"
        eyebrowColor="var(--accent-pink)"
      />

      {(error || createError || joinError) && (
        <div className="glass p-4 mb-6 flex items-start justify-between gap-3" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <p className="text-sm font-medium text-red-400">{error || createError || joinError}</p>
          <button
            onClick={() => {
              setError(null);
              setCreateError(null);
              setJoinError(null);
            }}
            className="text-neutral-400 hover:text-white transition shrink-0"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* Start a session */}
      <section className="glass card-shadow p-6 md:p-7 mb-6 animate-rise">
        <h2 className="font-display text-xl font-bold text-white mb-1">Start a Review Session</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          Pick a teammate to review. One editor drives the numbers, everyone else reviews live.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {players.map((player) => {
            const isCurrentUser = currentPlayerId === player.id;
            const hasActiveSession = sessions.some(
              (s) => s.playerName === player.username && s.status === 'active'
            );
            const hex = getUserColorHex(player.id);
            const disabled = isCurrentUser || hasActiveSession || creating;

            return (
              <button
                key={player.id}
                onClick={() => !isCurrentUser && !hasActiveSession && handleCreateSession(player.id)}
                disabled={disabled}
                className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition ${
                  isCurrentUser
                    ? 'opacity-40 cursor-not-allowed'
                    : hasActiveSession
                    ? 'cursor-default'
                    : 'hover:-translate-y-0.5'
                }`}
                style={{
                  borderColor: hasActiveSession ? 'rgba(52,211,153,0.4)' : `${hex}44`,
                  background: hasActiveSession ? 'rgba(52,211,153,0.07)' : `${hex}0d`,
                }}
              >
                <Avatar id={player.id} name={player.username} size={38} />
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{player.username}</p>
                  <p className="text-xs" style={{ color: hasActiveSession ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                    {isCurrentUser ? "That's you" : hasActiveSession ? 'Session active' : 'Start review'}
                  </p>
                </div>
                {!isCurrentUser && !hasActiveSession && (
                  <span className="ml-auto shrink-0" style={{ color: hex }}>
                    <PlusIcon size={18} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Active sessions */}
      {sessions.length > 0 ? (
        <section className="animate-rise animate-rise-1">
          <h2 className="font-display text-xl font-bold text-white mb-4">Active Sessions</h2>
          <div className="space-y-3">
            {sessions.map((session) => {
              const isSubject = currentPlayerId === session.targetPlayerId;
              const hex = getUserColorHex(session.targetPlayerId);
              return (
                <div
                  key={session.id}
                  className="glass card-shadow p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
                  style={{ borderLeft: `3px solid ${hex}` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar id={session.targetPlayerId} name={session.playerName} size={42} />
                    <div className="min-w-0">
                      <h4 className="font-semibold text-white truncate">Reviewing {session.playerName}</h4>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Started {new Date(session.createdAt).toLocaleDateString()}
                        <span className="inline-flex items-center gap-1 ml-2">
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: 'var(--accent-green)' }} />
                          <span style={{ color: 'var(--accent-green)' }}>live</span>
                        </span>
                      </p>
                    </div>
                  </div>

                  {isSubject ? (
                    <p className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      You can't take part in your own review
                    </p>
                  ) : session.currentUserRole ? (
                    <div className="flex gap-2 items-center shrink-0">
                      <Link
                        href={`/reviews/sessions/${session.id}`}
                        className="btn-gradient text-sm py-2"
                      >
                        {session.currentUserRole === 'editor' ? (
                          <>
                            <PencilIcon size={14} /> Continue editing
                          </>
                        ) : (
                          <>
                            <EyeIcon size={14} /> Continue reviewing
                          </>
                        )}
                      </Link>
                      <button
                        onClick={() => handleCloseSession(session.id)}
                        disabled={closing === session.id}
                        className="p-2.5 rounded-xl border text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                        style={{ borderColor: 'rgba(239,68,68,0.35)' }}
                        title="Discard & close session"
                      >
                        <XIcon size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleJoin(session.id, 'editor')}
                        disabled={joining === session.id}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-white border transition hover:bg-blue-500/20 disabled:opacity-50"
                        style={{ borderColor: 'rgba(59,130,246,0.45)', background: 'rgba(59,130,246,0.12)' }}
                      >
                        <span className="flex items-center gap-1.5">
                          <PencilIcon size={14} /> Join as editor
                        </span>
                      </button>
                      <button
                        onClick={() => handleJoin(session.id, 'reviewer')}
                        disabled={joining === session.id}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-white border transition hover:bg-emerald-500/20 disabled:opacity-50"
                        style={{ borderColor: 'rgba(52,211,153,0.45)', background: 'rgba(52,211,153,0.12)' }}
                      >
                        <span className="flex items-center gap-1.5">
                          <EyeIcon size={14} /> Reviewer
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="glass text-center py-16 animate-rise animate-rise-1">
          <h2 className="font-display text-xl font-bold text-white mb-1">No active sessions</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Start one above to begin a collaborative review.</p>
        </div>
      )}
    </AppShell>
  );
}
