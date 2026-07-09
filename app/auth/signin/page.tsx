'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { EyeIcon, EyeOffIcon } from '@/components/icons';

// Fallback while the live roster loads (or if the API is unreachable)
const CREW_FALLBACK = ['Zeyan', 'Ryan', 'Qam', 'B'];

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [crew, setCrew] = useState<string[]>(CREW_FALLBACK);

  // Live roster — the crew grows/shrinks with the admin's roster changes
  useEffect(() => {
    fetch('/api/players')
      .then((res) => (res.ok ? res.json() : null))
      .then((players: any[] | null) => {
        if (Array.isArray(players) && players.length > 0) {
          setCrew(players.map((p) => String(p.username)));
        }
      })
      .catch(() => {});
  }, []);

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
    } catch {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Ambient glows */}
      <div
        className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-25 blur-3xl pointer-events-none"
        style={{ background: 'var(--brand-gradient)' }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Brand */}
        <div className="text-center mb-10 animate-rise">
          <div className="flex justify-center mb-5">
            <Logo size="xl" href={null} />
          </div>
          <p
            className="text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            One crew · One direction
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            {crew.map((name, i) => (
              <span key={name} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="w-1 h-1 rounded-full" style={{ background: 'var(--surface-border-strong)' }} />
                )}
                <span className="text-sm font-semibold text-gradient font-display">{name}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Sign in card */}
        <div className="glass-strong card-shadow-lg p-8 mb-6 relative overflow-hidden animate-rise animate-rise-1">
          <div className="absolute top-0 left-0 right-0 brand-hairline" />
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                placeholder="you@4ward.crew"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-12"
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition disabled:opacity-50"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-gradient w-full py-3 text-base">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: 'var(--surface-border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              First time here?{' '}
              <Link href="/claim-profile" className="font-semibold hover:underline" style={{ color: 'var(--accent-cyan)' }}>
                Claim your profile
              </Link>
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 text-center animate-rise animate-rise-2">
          {[
            { label: 'Categories', value: '7', color: 'var(--accent-green)' },
            { label: 'Stats each', value: '70', color: 'var(--accent-orange)' },
            { label: 'Friends', value: String(crew.length), color: 'var(--accent-pink)' },
          ].map((item) => (
            <div key={item.label} className="glass p-4">
              <p className="font-display text-2xl font-bold" style={{ color: item.color }}>
                {item.value}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
