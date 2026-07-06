'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { EyeIcon, EyeOffIcon, CheckIcon } from '@/components/icons';

function PasswordField({
  label,
  value,
  onChange,
  show,
  setShow,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-2 text-white">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="••••••••"
          className="field pr-12"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          disabled={disabled}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition disabled:opacity-50"
        >
          {show ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
        </button>
      </div>
      {hint && (
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      setEmail(session?.user?.email || '');
      setLoading(false);
    }
  }, [status, session, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Current password is required');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email !== session?.user?.email ? email : undefined,
          currentPassword,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Profile updated successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(data.error || 'Failed to update profile');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Settings" eyebrow="Account" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader title="Account Settings" subtitle="Update your email or password." eyebrow="Account" />

      <div className="glass card-shadow p-6 md:p-8 max-w-2xl animate-rise">
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2 text-white">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              className="field"
            />
          </div>

          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrentPassword}
            setShow={setShowCurrentPassword}
            hint="Required to confirm any changes"
            disabled={saving}
          />

          <PasswordField
            label="New password (optional)"
            value={newPassword}
            onChange={setNewPassword}
            show={showNewPassword}
            setShow={setShowNewPassword}
            disabled={saving}
          />

          {newPassword && (
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirmPassword}
              setShow={setShowConfirmPassword}
              disabled={saving}
            />
          )}

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 flex items-center gap-2">
              <CheckIcon size={15} />
              {success}
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-gradient w-full py-3">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
