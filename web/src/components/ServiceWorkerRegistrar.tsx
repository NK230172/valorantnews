'use client';

import { useEffect } from 'react';
import { registerPush, isNotifyEnabled } from '@/lib/notifications';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // 通知設定が ON のときだけ静かに購読を維持（許可プロンプトは出さない）
        if (isNotifyEnabled()) registerPush(reg).catch(console.error);
      })
      .catch(console.error);
  }, []);
  return null;
}
