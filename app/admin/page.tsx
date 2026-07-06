'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { WarningIcon, CheckIcon } from '@/components/icons';

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
    <AppShell width="narrow">
      <PageHeader
        title="Admin Panel"
        subtitle="Maintenance and administrative controls."
        eyebrow="Admin"
        eyebrowColor="var(--accent-red)"
      />

      <div className="glass card-shadow p-6 md:p-8 mb-24 animate-rise">
        <h2 className="font-display text-xl font-bold text-white mb-2">Admin Dashboard</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Welcome to the admin panel. Use the controls below for administrative tasks.
        </p>
      </div>

      {/* Danger zone */}
      {!showDangerZone ? (
        <div className="text-center">
          <button
            onClick={() => setShowDangerZone(true)}
            className="text-xs px-3 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 border transition"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            View danger zone
          </button>
        </div>
      ) : (
        <div
          className="rounded-3xl border-2 p-6 md:p-8 animate-rise"
          style={{ borderColor: 'rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.05)' }}
        >
          <div className="flex items-start gap-4 mb-6">
            <span className="text-red-400 shrink-0 mt-1">
              <WarningIcon size={32} />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold text-red-400 mb-1">Danger Zone</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                This action will <strong className="text-white">delete all data</strong> and reset the
                database to its initial state. It cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-white block mb-2">Admin password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Enter admin password to proceed"
                className="field"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSeed();
                }}
                disabled={seeding}
              />
              {passwordError && <p className="text-red-400 text-sm mt-2">{passwordError}</p>}
            </div>

            {seedSuccess && (
              <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 flex items-center gap-2">
                <CheckIcon size={15} />
                Database seeded successfully. All data has been reset.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="flex-1 py-3 px-6 rounded-xl font-bold text-white transition disabled:opacity-50 bg-red-600 hover:bg-red-500"
              >
                {seeding ? 'Seeding...' : 'Reset database & seed data'}
              </button>
              <button onClick={() => setShowDangerZone(false)} className="btn-ghost">
                Hide
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
