// VAL Tracker Service Worker
// push 受信時に /api/live から最新スコアを取得して通知を表示する

self.addEventListener('push', (event) => {
  event.waitUntil(
    fetch('/api/live', { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ matches }) => {
        if (!matches || matches.length === 0) {
          return self.registration.showNotification('VAL Tracker', {
            body: 'スコアが更新されました',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'val-live',
          });
        }
        const body = matches
          .slice(0, 4)
          .map((m) => `${m.team1_name} ${m.team1_score} - ${m.team2_score} ${m.team2_name}`)
          .join('\n');
        return self.registration.showNotification('🔴 LIVE', {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'val-live',
          renotify: true,
        });
      })
      .catch(() =>
        self.registration.showNotification('VAL Tracker', {
          body: 'ライブスコア更新',
          icon: '/icon-192.png',
          tag: 'val-live',
        })
      )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
