/* 4WARD service worker.
 *
 * Deliberately does NOT cache app shell / API responses: the whole app is live
 * crew data (votes, stats, feeds) and serving it stale would be worse than a
 * blank screen. Its job is to exist (so iOS treats this as an installable web
 * app) and to receive push.
 *
 * The push handlers are already wired even though sending isn't switched on
 * yet — a service worker that never changes is one less thing to invalidate on
 * every device later.
 */

const VERSION = 'v1';

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '4WARD', body: event.data.text() };
  }

  const title = payload.title || '4WARD';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/badge-96.png',
    // Collapse repeats of the same kind (e.g. several vote reminders)
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    vibrate: [80, 40, 80],
    data: { url: payload.url || '/', sentAt: Date.now() },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  // Focus an existing window if one is already open, else open a new one
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
