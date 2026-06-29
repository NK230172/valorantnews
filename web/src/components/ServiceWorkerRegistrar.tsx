'use client';

import { useEffect } from 'react';
import { registerPush } from '@/lib/notifications';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => registerPush(reg).catch(console.error))
      .catch(console.error);
  }, []);
  return null;
}
