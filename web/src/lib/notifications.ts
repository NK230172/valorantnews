// Web Push 購読登録 / 解除（設定画面・SW登録から呼ばれる）

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const VAPID_PUB_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

export const PUSH_ENDPOINT_KEY = 'val_push_endpoint';
export const NOTIFY_PREF_KEY = 'val_notify_enabled';

export function isNotifyEnabled(): boolean {
  try { return localStorage.getItem(NOTIFY_PREF_KEY) === 'true'; } catch { return false; }
}

async function savePushSub(sub: PushSubscription): Promise<void> {
  try { localStorage.setItem(PUSH_ENDPOINT_KEY, sub.endpoint); } catch { /* ignore */ }
  await fetch(`${SUPABASE_URL}/functions/v1/register-device/webpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(sub.toJSON()),
  });
}

// SW 登録済みなら購読を確実にする（設定が ON のときのみ自動実行）
export async function registerPush(reg: ServiceWorkerRegistration): Promise<void> {
  if (!VAPID_PUB_KEY) return;
  if (Notification.permission !== 'granted') return; // 許可済みのときだけ静かに再購読
  const existing = await reg.pushManager.getSubscription();
  if (existing) { await savePushSub(existing); return; }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUB_KEY),
  });
  await savePushSub(sub);
}

// 通知を有効化（設定トグル ON）。戻り値: 'ok' | 'denied' | 'unsupported'
export async function enableNotifications(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUB_KEY) {
    return 'unsupported';
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUB_KEY),
    });
  }
  await savePushSub(sub);
  try { localStorage.setItem(NOTIFY_PREF_KEY, 'true'); } catch { /* ignore */ }
  return 'ok';
}

// 通知を無効化（設定トグル OFF）
export async function disableNotifications(): Promise<void> {
  try { localStorage.setItem(NOTIFY_PREF_KEY, 'false'); } catch { /* ignore */ }
  let endpoint: string | null = null;
  try { endpoint = localStorage.getItem(PUSH_ENDPOINT_KEY); } catch { /* ignore */ }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { endpoint = sub.endpoint; await sub.unsubscribe(); }
    }
  } catch { /* ignore */ }

  if (endpoint) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/register-device/webpush`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ endpoint }),
      });
    } catch { /* ignore */ }
  }
  try { localStorage.removeItem(PUSH_ENDPOINT_KEY); } catch { /* ignore */ }
}

// ウォッチリストの増減をサーバーへ同期（プッシュ通知の対象試合）
export async function syncWatchToServer(matchId: string, add: boolean): Promise<void> {
  let endpoint: string | null = null;
  try { endpoint = localStorage.getItem(PUSH_ENDPOINT_KEY); } catch { /* ignore */ }
  if (!endpoint) return; // 通知未許可なら何もしない
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/register-device/watch-web`, {
      method: add ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ endpoint, matchId }),
    });
  } catch { /* ignore */ }
}
