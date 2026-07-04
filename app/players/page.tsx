'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Player {
  id: string;
  username: string;
}

export default function PlayersPage() {
  const { status } = useSession();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      loadPlayers();
    }
  }, [status, router]);

  const loadPlayers = async () => {
    try {
      const res = await fetch('/api/players');
      const result = await res.json();
      setPlayers(result);
    } catch (error) {
      console.error('Failed to load players:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header with gradient accent */}
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple), var(--accent-pink), var(--accent-green))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>Player Profiles</h1>
          <p style={{ color: 'var(--text-secondary)' }}>View and compare teammates</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {players.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">👥</div>
            <p style={{ color: 'var(--text-secondary)' }} className="text-lg">No players found. Seed the database to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {players.map((player, idx) => {
              const colors = [
                { accent: 'var(--accent-cyan)' },
                { accent: 'var(--accent-purple)' },
                { accent: 'var(--accent-pink)' },
                { accent: 'var(--accent-green)' }
              ];
              const color = colors[idx % 4];

              return (
                <Link key={player.id} href={`/players/${player.id}`}>
                  <div className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 transition cursor-pointer group card-shadow overflow-hidden relative">
                    <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: color.accent }} />
                    <div className="relative z-10">
                      <div
                        className="w-3 h-3 rounded-full mb-4"
                        style={{ backgroundColor: color.accent }}
                      />
                      <h2 className="text-2xl font-bold mb-2 text-white">
                        {player.username}
                      </h2>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        View detailed stats
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
