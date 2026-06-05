const CACHE_NAME = 'mitaines-v4';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: '🧤 Mitaines', body: event.data?.text() || '' };
  }

  const options = {
    body: data.body || 'Est-ce que tu ronges là?',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'mitaines-check',
    requireInteraction: data.requireInteraction ?? true,
    data: data.data || {},
    vibrate: [200, 100, 200],
  };

  if (data.actions) {
    options.actions = data.actions;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '🧤 Mitaines', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const notifData = event.notification.data || {};
  const token = notifData.token;

  const logCheckin = (biting) => {
    if (!token) return Promise.resolve();
    return fetch('/api/v1/checkins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ biting, context: null, type: 'ping_response' }),
    }).catch(() => {});
  };

  if (action === 'clean') {
    event.waitUntil(logCheckin(false));
  } else if (action === 'biting') {
    event.waitUntil(logCheckin(true));
  } else {
    event.waitUntil(
      clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          if (clientList.length > 0) {
            return clientList[0].focus();
          }
          return clients.openWindow('/');
        })
    );
  }
});
