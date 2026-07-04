'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

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
    if (status === 'loading') {
      return;
    }

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

    const interval = setInterval(() => {
      const fetchSessions = async () => {
        try {
          const res = await fetch('/api/reviews/cycles');
          if (res.ok) {
            setSessions(await res.json());
          }
        } catch (error) {
          console.error('Failed to refresh sessions:', error);
        }
      };
      fetchSessions();
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
      console.error('Failed to create review session:', err);
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
      });

      if (res.ok) {
        loadData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to close session');
      }
    } catch (err: any) {
      console.error('Failed to close session:', err);
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
        // Real-time update will happen via polling
        await loadData();
      } else {
        const data = await res.json();
        setJoinError(data.error || 'Failed to join session');
      }
    } catch (err: any) {
      console.error('Failed to join session:', err);
      setJoinError(err.message || 'An error occurred');
    } finally {
      setJoining(null);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (!currentPlayerId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-400 mb-4">Error: No player ID found in session</p>
          <p style={{ color: 'var(--text-secondary)' }}>Please log out and log back in</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-orange))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--foreground)' }}>📋 Collaborative Reviews</h1>
          <p style={{ color: 'var(--text-secondary)' }} className="mt-1">Real-time stat review sessions</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {(error || createError || joinError) && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 px-6 py-4 rounded-2xl mb-6">
            <p className="font-semibold">Error: {error || createError || joinError}</p>
            <button
              onClick={() => {
                setError(null);
                setCreateError(null);
                setJoinError(null);
              }}
              className="text-sm mt-2 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="space-y-8">
          {/* Create Sessions */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
            <h3 className="text-2xl font-bold text-white mb-4">Start a Review Session</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Choose a player to review their stats collaboratively. 1 editor, up to 5 reviewers.
            </p>
            {!currentPlayerId ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading session data...</p>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {players.map((player) => {
                const isCurrentUser = currentPlayerId === player.id;
                const hasActiveSession = sessions.some(
                  (s) => s.playerName === player.username && s.status === 'active'
                );

                let buttonText = '';
                let buttonClass = '';
                let isDisabled = false;

                if (isCurrentUser) {
                  buttonText = '🚫 Cannot review own stats';
                  buttonClass = 'bg-neutral-700/30 border-neutral-600 text-neutral-400 cursor-not-allowed';
                  isDisabled = true;
                } else if (hasActiveSession) {
                  buttonText = '✓ Session Active';
                  buttonClass = 'bg-green-900/20 border-green-700 text-green-300 cursor-default';
                  isDisabled = true;
                } else {
                  buttonText = `+ ${player.username}`;
                  buttonClass = 'bg-neutral-800 border-neutral-700 hover:border-neutral-600';
                  isDisabled = creating;
                }

                return (
                  <button
                    key={player.id}
                    onClick={() => !isCurrentUser && handleCreateSession(player.id)}
                    disabled={isDisabled}
                    className={`p-4 rounded-xl border transition text-white font-semibold ${buttonClass}`}
                  >
                    {buttonText}
                  </button>
                );
              })}
            </div>
            )}
          </div>

          {/* Active Sessions */}
          {sessions.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--foreground)' }}>Active Sessions</h2>
              <div className="space-y-4">
                {sessions.map((session) => {
                  const isSubject = currentPlayerId === session.targetPlayerId;
                  return (
                  <div
                    key={session.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-lg font-bold text-white">{session.playerName}</h4>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Started {new Date(session.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {isSubject ? (
                      <div className="px-4 py-2 rounded-lg text-neutral-400 text-sm">
                        🚫 Cannot participate in own review
                      </div>
                    ) : session.currentUserRole ? (
                      <div className="flex gap-2 items-center">
                        <Link href={`/reviews/sessions/${session.id}`} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${session.currentUserRole === 'editor' ? 'bg-blue-900/30 hover:bg-blue-900/50 border-blue-800 text-blue-300' : 'bg-green-900/30 hover:bg-green-900/50 border-green-800 text-green-300'}`}>
                          {session.currentUserRole === 'editor' ? '✏️ Editing' : '👁️ Reviewing'}
                        </Link>
                        <button
                          onClick={() => handleCloseSession(session.id)}
                          disabled={closing === session.id}
                          className="px-4 py-2 text-white rounded-lg transition font-semibold bg-red-900/30 hover:bg-red-900/50 border border-red-800 disabled:opacity-50"
                        >
                          {closing === session.id ? '⏳' : '✕'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleJoin(session.id, 'editor')}
                          disabled={joining === session.id}
                          className="px-4 py-2 text-white rounded-lg transition font-semibold bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800 disabled:opacity-50"
                        >
                          {joining === session.id ? '⏳' : '✏️ Editor'}
                        </button>
                        <button
                          onClick={() => handleJoin(session.id, 'reviewer')}
                          disabled={joining === session.id}
                          className="px-4 py-2 text-white rounded-lg transition font-semibold bg-green-900/30 hover:bg-green-900/50 border border-green-800 disabled:opacity-50"
                        >
                          {joining === session.id ? '⏳' : '👁️ Reviewer'}
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {sessions.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">👥</div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>No Active Sessions</h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Create a session above to begin a collaborative review.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
