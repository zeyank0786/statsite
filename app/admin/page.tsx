'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export default function AdminPage() {
  const { status } = useSession();
  const router = useRouter();
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  const handleSeed = async () => {
    if (!password) {
      setPasswordError('Password is required');
      return;
    }

    setSeeding(true);
    setPasswordError('');
    setSeedSuccess(false);

    try {
      const res = await fetch('/api/admin/seed-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setSeedSuccess(true);
        setPassword('');
      } else {
        const data = await res.json();
        setPasswordError(data.error || 'Failed to seed database');
      }
    } catch (error: any) {
      setPasswordError(error.message || 'An error occurred');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-orange))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--foreground)' }}>⚙️ Admin Panel</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8 mb-32">
          {/* Regular content would go here */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
            <h2 className="text-2xl font-bold text-white mb-4">Admin Dashboard</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Welcome to the admin panel. Use the controls below for administrative tasks.</p>
          </div>
        </div>

        {/* Dangerous Zone - At the very bottom, hidden by default */}
        {!showDangerZone ? (
          <div className="text-center mt-16">
            <button
              onClick={() => setShowDangerZone(true)}
              className="text-xs px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-300 transition"
            >
              View Danger Zone
            </button>
          </div>
        ) : (
          <div className="mt-16 bg-black/95 backdrop-blur border-t-4 border-red-900 p-8">
            <div className="max-w-7xl mx-auto">
              <div className="bg-red-950/30 border-2 border-red-800 rounded-2xl p-8">
              <div className="flex items-start gap-4 mb-6">
                <span className="text-5xl">⚠️</span>
                <div>
                  <h3 className="text-2xl font-bold text-red-400 mb-2">DANGER ZONE</h3>
                  <p style={{ color: 'var(--text-secondary)' }} className="text-sm mb-2">
                    This action will <strong>DELETE ALL DATA</strong> and reset the database to initial state.
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }} className="text-sm">
                    This cannot be undone. Only use this during development or testing.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-white block mb-2">Admin Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="Enter admin password to proceed"
                    className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-red-700"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSeed();
                    }}
                    disabled={seeding}
                  />
                  {passwordError && (
                    <p className="text-red-400 text-sm mt-2">{passwordError}</p>
                  )}
                </div>

                {seedSuccess && (
                  <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg">
                    ✓ Database seeded successfully. All data has been reset to initial state.
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleSeed}
                    disabled={seeding}
                    className="flex-1 py-3 px-6 rounded-lg font-bold text-white transition disabled:opacity-50 bg-red-700 hover:bg-red-600"
                  >
                    {seeding ? '⏳ Seeding...' : '💣 RESET DATABASE & SEED DATA'}
                  </button>
                  <button
                    onClick={() => setShowDangerZone(false)}
                    className="px-4 py-3 rounded-lg font-bold text-neutral-400 hover:text-neutral-200 transition bg-neutral-800 hover:bg-neutral-700"
                  >
                    Hide
                  </button>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
