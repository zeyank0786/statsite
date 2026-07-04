'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('player1@test.com');
  const [password, setPassword] = useState('password1');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        router.push('/');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (player: number) => {
    setEmail(`player${player}@test.com`);
    setPassword(`password${player}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header with accent */}
        <div className="text-center mb-12">
          <div className="inline-block mb-4">
            <div className="w-2 h-12 rounded-full" style={{ backgroundColor: 'var(--accent-cyan)' }} />
          </div>
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>Stats Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Track your development across 70 stats</p>
        </div>

        {/* Sign In Card with gradient top */}
        <div className="bg-neutral-900 rounded-2xl p-8 mb-8 card-shadow overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple), var(--accent-pink))' }} />
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-600 rounded-xl focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-600 rounded-xl focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold py-3 px-4 rounded-xl transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-cyan)' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Login Buttons */}
          <div className="mt-6 pt-6 border-t border-neutral-700">
            <p className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Quick Login
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => quickLogin(n)}
                  className="px-3 py-2 bg-neutral-800 border border-neutral-700 hover:border-neutral-600 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ['var(--accent-cyan)', 'var(--accent-purple)', 'var(--accent-pink)', 'var(--accent-green)'][n-1] }} />
                  Player {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Grid with color accents */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-neutral-900 rounded-xl p-5 card-shadow overflow-hidden relative group hover:border hover:border-neutral-700 transition">
            <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-green)' }} />
            <div className="relative z-10">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Categories</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--accent-green)' }}>7</p>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-5 card-shadow overflow-hidden relative group hover:border hover:border-neutral-700 transition">
            <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-orange)' }} />
            <div className="relative z-10">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Total Stats</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--accent-orange)' }}>70</p>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-5 card-shadow overflow-hidden relative group hover:border hover:border-neutral-700 transition">
            <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-pink)' }} />
            <div className="relative z-10">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Players</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--accent-pink)' }}>4</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
