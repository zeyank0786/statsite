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
  const [seeding, setSeeding] = useState(false);
  const [showSeedButton, setShowSeedButton] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    initializePage();
  }, []);

  const initializePage = async () => {
    try {
      // Try to load players
      const res = await fetch('/api/players');
      if (res.ok) {
        const data = await res.json();
        if (data.length === 0) {
          // No players found, show seed button
          setShowSeedButton(true);
          setLoading(false);
        } else {
          setPlayers(data);
          setLoading(false);
        }
      }
    } catch (err) {
      console.error('Failed to load players:', err);
      setLoading(false);
    }
  };

  const seedDatabase = async () => {
    setSeeding(true);
    setError('');
    try {
      const password = prompt('Enter admin password to seed database:');
      if (!password) return;

      const res = await fetch('/api/admin/seed-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setSuccess('✓ Database seeded! Loading players...');
        setShowSeedButton(false);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to seed database');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to seed database');
    } finally {
      setSeeding(false);
    }
  };

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

  if (showSeedButton) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
              No Players Found
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Initialize the database with test players
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow space-y-5">
            <p style={{ color: 'var(--text-secondary)' }}>
              This will create 4 test players (Player 1-4) with the following credentials:
            </p>
            <div className="bg-neutral-800 rounded-lg p-4 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p>🎮 <strong>Player 1</strong> - player1@test.com / password1</p>
              <p>🎮 <strong>Player 2</strong> - player2@test.com / password2</p>
              <p>🎮 <strong>Player 3</strong> - player3@test.com / password3</p>
              <p>🎮 <strong>Player 4</strong> - player4@test.com / password4</p>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-900/30 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <button
              onClick={seedDatabase}
              disabled={seeding}
              className="w-full py-3 rounded-lg font-semibold text-white transition text-lg"
              style={{
                backgroundColor: 'var(--accent-cyan)',
                opacity: seeding ? 0.5 : 1,
                cursor: seeding ? 'not-allowed' : 'pointer',
              }}
            >
              {seeding ? '⏳ Seeding Database...' : '🌱 Initialize Database'}
            </button>
          </div>
        </div>
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
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={claiming}
                  placeholder="••••••"
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 disabled:opacity-50 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={claiming}
                  className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-300 disabled:opacity-50"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={claiming}
                  placeholder="••••••"
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 disabled:opacity-50 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={claiming}
                  className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-300 disabled:opacity-50"
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
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
