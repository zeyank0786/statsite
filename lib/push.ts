import webpush from 'web-push';
import { query, queryAll } from './db';
import { v4 as uuid } from 'uuid';

/**
 * Web Push delivery.
 *
 * Requires two server env vars (generate once with `web-push generate-vapid-keys`):
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 * Without them every function here is a graceful no-op, so the app behaves
 * exactly as before push existed — nothing throws, nothing breaks.
 *
 * iOS note: push only works for home-screen installs (iOS 16.4+), never in a
 * Safari tab, and iOS silently drops subscriptions when an app is deleted or
 * left unused. Dead endpoints return 404/410 on send and are pruned here, so
 * the client re-subscribing is always enough to recover.
 */

export const pushConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let vapidReady = false;
function ensureVapid(): boolean {
  if (!pushConfigured) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:itzzedk@gmail.com',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    vapidReady = true;
  }
  return true;
}

/** Additive table — created on first use, no manual migration. */
export async function ensurePushTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS PushSubscription (
       id        TEXT PRIMARY KEY,
       playerId  TEXT NOT NULL,
       endpoint  TEXT NOT NULL UNIQUE,
       p256dh    TEXT NOT NULL,
       auth      TEXT NOT NULL,
       createdAt TEXT NOT NULL
     )`
  );
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when tapped */
  url?: string;
  /** Collapse key — a newer push with the same tag replaces the older one */
  tag?: string;
}

export async function saveSubscription(
  playerId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await ensurePushTable();
  // One row per endpoint (a device). Re-subscribing re-points it at the
  // current player rather than duplicating.
  await query('DELETE FROM PushSubscription WHERE endpoint = ?', [sub.endpoint]);
  await query(
    'INSERT INTO PushSubscription (id, playerId, endpoint, p256dh, auth, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), playerId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, new Date().toISOString()]
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await ensurePushTable();
  await query('DELETE FROM PushSubscription WHERE endpoint = ?', [endpoint]);
}

/**
 * Fire-and-forget push to a set of players. Never throws: a failed send must
 * never roll back the action that triggered it (a vote, an approved stat).
 */
export async function sendPushToPlayers(playerIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0 || !ensureVapid()) return 0;

  try {
    await ensurePushTable();
    const placeholders = ids.map(() => '?').join(',');
    const subs = await queryAll(
      `SELECT endpoint, p256dh, auth FROM PushSubscription WHERE playerId IN (${placeholders})`,
      ids
    );
    if (subs.length === 0) return 0;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      tag: payload.tag,
      icon: '/icon-192.png',
    });

    let sent = 0;
    await Promise.all(
      (subs as any[]).map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: String(s.endpoint),
              keys: { p256dh: String(s.p256dh), auth: String(s.auth) },
            },
            body
          );
          sent++;
        } catch (err: any) {
          // 404/410 = the browser threw the subscription away (app deleted,
          // permission revoked, iOS pruned it). Drop the dead row.
          const code = err?.statusCode;
          if (code === 404 || code === 410) {
            await query('DELETE FROM PushSubscription WHERE endpoint = ?', [String(s.endpoint)]).catch(() => {});
          } else {
            console.error('Push send failed:', code, err?.body || err?.message);
          }
        }
      })
    );
    return sent;
  } catch (e) {
    console.error('Push dispatch failed (ignored):', e);
    return 0;
  }
}

/** Convenience wrapper — never let push break the caller. */
export function firePush(playerIds: string[], payload: PushPayload): void {
  sendPushToPlayers(playerIds, payload).catch((e) => console.error('firePush failed:', e));
}
