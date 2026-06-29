// Web Push 購読登録（クライアントコンポーネントから呼ばれるユーティリティ）

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

async function savePushSub(sub: PushSubscription): Promise<void> {
  await fetch(`${SUPABASE_URL}/functions/v1/register-device/webpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(sub.toJSON()),
  });
}

export async function registerPush(reg: ServiceWorkerRegistration): Promise<void> {
  if (!VAPID_PUB_KEY) return;

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  const existing = await reg.pushManager.getSubscription();
  if (existing) { await savePushSub(existing); return; }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUB_KEY),
  });
  await savePushSub(sub);
}
