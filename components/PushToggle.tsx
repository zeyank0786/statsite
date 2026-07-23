'use client';

import { useEffect, useState } from 'react';
import { BellIcon, CheckIcon, WarningIcon } from './icons';

/**
 * Enable/disable Web Push for this device.
 *
 * Permission MUST be requested from a real user gesture — Safari rejects
 * requests made on page load — so everything hangs off the button below.
 *
 * iOS only exposes push to home-screen installs, so when we detect iOS in a
 * browser tab we explain the Add-to-Home-Screen step instead of showing a
 * button that would silently fail.
 */

/** VAPID keys travel as URL-safe base64; the Push API wants raw bytes. */
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export default function PushToggle() {
  const [supported, setSupported] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);
    setStandalone(
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    );
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (!ok) return;

    setPermission(Notification.permission);

    fetch('/api/push')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setConfigured(Boolean(d.configured));
        setVapidKey(d.vapidPublicKey || null);
      })
      .catch(() => {});

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  const enable = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError(
          perm === 'denied'
            ? 'Notifications are blocked for 4WARD. Turn them back on in your device settings, then try again.'
            : 'Permission was dismissed — tap again when you’re ready.'
        );
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      // Reuse an existing subscription if the browser already has one
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        if (!vapidKey) {
          setError('Server push keys are missing — the app owner needs to finish setup.');
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(vapidKey),
        });
      }

      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not save the subscription.');
        return;
      }
      setSubscribed(true);
      setNote('Notifications are on for this device.');
    } catch (e: any) {
      setError(e?.message || 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setNote('Notifications are off for this device.');
    } catch (e: any) {
      setError(e?.message || 'Could not disable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setNote(d.sent > 0 ? 'Test sent — check your notifications.' : 'No devices are subscribed yet.');
      else setError(d.error || 'Could not send a test.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass card-shadow p-6 md:p-8 max-w-2xl animate-rise mt-6">
      <div className="flex items-center gap-2.5 mb-2">
        <BellIcon size={18} />
        <h2 className="font-display text-lg font-bold text-white">Notifications</h2>
      </div>
      <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
        Get alerted when a suggestion needs your vote, your stats change, or you rank up — even when
        4WARD is closed. This is per-device, so turn it on wherever you want alerts.
      </p>

      {/* iOS in a browser tab: push is impossible until installed */}
      {isIOS && !standalone ? (
        <div
          className="rounded-xl px-4 py-3.5 text-sm border flex items-start gap-2.5"
          style={{ borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.07)' }}
        >
          <span style={{ color: 'var(--accent-yellow)' }} className="shrink-0 mt-0.5">
            <WarningIcon size={16} />
          </span>
          <p style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--accent-yellow)' }}>
              Add 4WARD to your home screen first.
            </span>{' '}
            On iPhone, notifications only work for installed apps. Tap the Share button, then{' '}
            <span className="text-white font-medium">Add to Home Screen</span>, open 4WARD from
            there, and this option will appear.
          </p>
        </div>
      ) : !supported ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          This browser doesn&apos;t support push notifications.
        </p>
      ) : !configured ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Push isn&apos;t switched on for 4WARD yet — the server keys still need to be added.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2.5 flex-wrap">
            {subscribed ? (
              <>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border"
                  style={{ borderColor: 'rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.1)', color: 'var(--accent-green)' }}
                >
                  <CheckIcon size={14} /> On for this device
                </span>
                <button onClick={sendTest} disabled={busy} className="btn-ghost text-sm py-2 disabled:opacity-50">
                  Send test
                </button>
                <button
                  onClick={disable}
                  disabled={busy}
                  className="px-3.5 py-2 rounded-xl text-sm font-semibold border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition disabled:opacity-50"
                >
                  Turn off
                </button>
              </>
            ) : (
              <button onClick={enable} disabled={busy} className="btn-gradient text-sm py-2.5">
                <BellIcon size={15} />
                {busy ? 'Enabling…' : 'Turn on notifications'}
              </button>
            )}
          </div>

          {permission === 'denied' && !subscribed && (
            <p className="text-xs mt-3" style={{ color: 'var(--accent-yellow)' }}>
              Notifications are currently blocked for 4WARD in your device settings — you&apos;ll need
              to allow them there first.
            </p>
          )}
        </>
      )}

      {note && (
        <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 mt-4 flex items-center gap-2">
          <CheckIcon size={15} /> {note}
        </div>
      )}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mt-4">
          {error}
        </div>
      )}
    </div>
  );
}
