'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { EyeIcon, EyeOffIcon } from '@/components/icons';

interface Player {
  id: string;
  username: string;
}

export default function ClaimProfilePage() {
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
      const res = await fetch('/api/players');
      if (res.ok) {
        const data = await res.json();
        if (data.length === 0) {
          setShowSeedButton(true);
        } else {
          setPlayers(data);
        }
      }
    } catch (err) {
      console.error('Failed to load players:', err);
    } finally {
      setLoading(false);
    }
  };

  const seedDatabase = async () => {
    setSeeding(true);
    setError('');
    try {
      const pwd = prompt('Enter admin password to seed database:');
      if (!pwd) return;

      const res = await fetch('/api/admin/seed-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });

      if (res.ok) {
        setSuccess('Database seeded! Loading players...');
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
        body: JSON.stringify({ playerId: selectedPlayerId, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Profile claimed! Logging you in...');
        setTimeout(async () => {
          await signIn('credentials', {
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
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading players...</p>
      </div>
    );
  }

  if (showSeedButton) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <Logo size="lg" href={null} />
            </div>
            <h1 className="font-display text-3xl font-bold text-white mb-2">No players found</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Initialize the database with test players</p>
          </div>

          <div className="glass-strong card-shadow-lg p-8 space-y-5">
            <p style={{ color: 'var(--text-secondary)' }}>
              This will create 4 test players with the following credentials:
            </p>
            <div
              className="rounded-xl p-4 space-y-1.5 text-sm border"
              style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
            >
              <p><strong className="text-white">Alex</strong> — player1@test.com / password1</p>
              <p><strong className="text-white">Jordan</strong> — player2@test.com / password2</p>
              <p><strong className="text-white">Casey</strong> — player3@test.com / password3</p>
              <p><strong className="text-white">Taylor</strong> — player4@test.com / password4</p>
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10">
                {success}
              </div>
            )}

            <button onClick={seedDatabase} disabled={seeding} className="btn-gradient w-full py-3">
              {seeding ? 'Seeding database...' : 'Initialize database'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'var(--brand-gradient)' }}
      />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 animate-rise">
          <div className="flex justify-center mb-5">
            <Logo size="lg" href={null} />
          </div>
          <h1 className="font-display text-3xl font-bold text-white mb-2">Claim your profile</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Pick your player and set up your account</p>
        </div>

        <div className="glass-strong card-shadow-lg p-8 relative overflow-hidden animate-rise animate-rise-1">
          <div className="absolute top-0 left-0 right-0 brand-hairline" />
          <form onSubmit={handleClaim} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Your player</label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                disabled={claiming}
                className="field"
              >
                <option value="">Choose a player...</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={claiming}
                placeholder="your@email.com"
                className="field"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={claiming}
                  placeholder="••••••••"
                  className="field pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={claiming}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition disabled:opacity-50"
                >
                  {showPassword ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={claiming}
                  placeholder="••••••••"
                  className="field pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={claiming}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition disabled:opacity-50"
                >
                  {showConfirmPassword ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10">
                {success}
              </div>
            )}

            <button type="submit" disabled={claiming} className="btn-gradient w-full py-3">
              {claiming ? 'Claiming profile...' : 'Claim profile'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: 'var(--surface-border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Already have an account?{' '}
              <Link href="/auth/signin" className="font-semibold hover:underline" style={{ color: 'var(--accent-cyan)' }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
