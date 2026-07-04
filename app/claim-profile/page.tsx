'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

interface Player {
  id: string;
  username: string;
}

export default function ClaimProfilePage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    loadAvailablePlayers();
  }, []);

  const loadAvailablePlayers = async () => {
    try {
      const res = await fetch('/api/players');
      if (res.ok) {
        const data = await res.json();
        setPlayers(data);
      }
    } catch (err) {
      console.error('Failed to load players:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedPlayerId) {
      setError('Please select a player');
      return;
    }

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setClaiming(true);

    try {
      const res = await fetch('/api/auth/claim-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selectedPlayerId,
          email,
          password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('✓ Profile claimed! Logging you in...');

        // Auto-login after a short delay
        setTimeout(async () => {
          const result = await signIn('credentials', {
            email,
            password,
            redirect: true,
            callbackUrl: '/',
          });
        }, 1500);
      } else {
        setError(data.error || 'Failed to claim profile');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <p style={{ color: 'var(--text-secondary)' }}>Loading players...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            Claim Your Profile
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Select your player and set up your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
          <form onSubmit={handleClaim} className="space-y-5">
            {/* Player Selection */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">
                Select Your Player
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                disabled={claiming}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white disabled:opacity-50"
              >
                <option value="">Choose a player...</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.username}
                  </option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={claiming}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={claiming}
                placeholder="••••••"
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 disabled:opacity-50"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={claiming}
                placeholder="••••••"
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 disabled:opacity-50"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-900/30 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={claiming}
              className="w-full py-3 rounded-lg font-semibold text-white transition text-lg"
              style={{
                backgroundColor: 'var(--accent-cyan)',
                opacity: claiming ? 0.5 : 1,
                cursor: claiming ? 'not-allowed' : 'pointer',
              }}
            >
              {claiming ? '⏳ Claiming Profile...' : '✓ Claim Profile'}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 pt-6 border-t border-neutral-800 text-center">
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Already have an account?
            </p>
            <Link
              href="/auth/signin"
              className="font-semibold transition"
              style={{ color: 'var(--accent-cyan)' }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
