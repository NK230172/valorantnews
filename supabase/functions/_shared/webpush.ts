// Web Push (VAPID) 送信ユーティリティ
// 空のペイロードで push を送信し、SW 側が /api/live を fetch して通知を表示する

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  publicKey: string;      // base64url, 65 バイトの非圧縮 EC 公開鍵
  privateKeyPkcs8: string; // base64url, PKCS8 DER 形式の秘密鍵
}

export function loadVapidKeys(): VapidKeys {
  const pub  = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY が未設定");
  return { publicKey: pub, privateKeyPkcs8: priv };
}

function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function textB64url(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(pad.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

async function vapidJwt(endpoint: string, keys: VapidKeys): Promise<string> {
  const { protocol, host } = new URL(endpoint);
  const now = Math.floor(Date.now() / 1000);

  const hdr = textB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const pay = textB64url(JSON.stringify({ aud: `${protocol}//${host}`, exp: now + 43200, sub: "mailto:noreply@valtracker.app" }));

  const privBytes = b64urlDecode(keys.privateKeyPkcs8);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", privBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, cryptoKey, new TextEncoder().encode(`${hdr}.${pay}`),
  );
  return `${hdr}.${pay}.${b64urlEncode(sig)}`;
}

export async function sendWebPush(sub: PushSubscription, keys: VapidKeys): Promise<boolean> {
  try {
    const jwt = await vapidJwt(sub.endpoint, keys);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt},k=${keys.publicKey}`,
        TTL: "86400",
        "Content-Length": "0",
      },
    });
    if (res.status === 410 || res.status === 404) return false; // subscription expired
    if (!res.ok) console.error(`WebPush ${res.status}: ${await res.text()}`);
    return true;
  } catch (e) {
    console.error("WebPush error:", e);
    return false;
  }
}

export async function broadcastWebPush(subs: PushSubscription[], keys: VapidKeys): Promise<void> {
  await Promise.allSettled(subs.map((s) => sendWebPush(s, keys)));
}
