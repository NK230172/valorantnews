// VAL Tracker Service Worker
// push 受信時に /api/live から最新スコアを取得して通知を表示する

function scoreLine(m) {
  const map = m.round_info ? `  (${m.round_info})` : '';
  return `${m.team1_name} ${m.team1_score} - ${m.team2_score} ${m.team2_name}${map}`;
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    // 1) 自分宛の保留通知（ウォッチ試合のラウンド速報など）を優先表示
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch(`/api/pending?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: 'no-store' });
        const { messages } = await r.json();
        if (messages && messages.length > 0) {
          for (const m of messages.slice(0, 5)) {
            await self.registration.showNotification(m.title, {
              body: m.body, icon: '/icon-192.png', badge: '/icon-192.png',
              tag: 'val-round-' + Math.random().toString(36).slice(2), renotify: true,
            });
          }
          return;
        }
      }
    } catch (e) { /* フォールバックへ */ }

    // 2) 保留が無ければライブスコア要約
    return fetch('/api/live', { cache: 'no-store' })
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
        // 直近で動いた試合（先頭）をタイトルに、残りを本文に
        const top = matches[0];
        const title = `🔴 ${top.team1_name} ${top.team1_score} - ${top.team2_score} ${top.team2_name}`;
        const rest = matches.slice(0, 5).map(scoreLine).join('\n');
        const body = top.round_info
          ? `${top.round_info}\n${rest}`
          : rest;
        return self.registration.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'val-live',
          renotify: true,
          timestamp: Date.now(),
        });
      })
      .catch(() =>
        self.registration.showNotification('VAL Tracker', {
          body: 'ライブスコア更新',
          icon: '/icon-192.png',
          tag: 'val-live',
        })
      );
  })());
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
