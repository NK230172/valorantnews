// Apple Push Notification service (APNs) クライアント
// JWT 認証（p8 秘密鍵）を使用した HTTP/2 Push 送信

const APNS_HOST = "https://api.push.apple.com";

// Supabase の環境変数から取得する設定
interface APNsConfig {
  keyId: string;         // APNS_KEY_ID
  teamId: string;        // APNS_TEAM_ID
  privateKeyP8: string;  // APNS_PRIVATE_KEY（-----BEGIN PRIVATE KEY----- を含む全文）
  bundleId: string;      // APNS_BUNDLE_ID（例: com.yourname.ValorantTracker）
}

let cachedJwt: { token: string; issuedAt: number } | null = null;

// APNs JWT を生成（30分ごとに更新）
async function getAPNsJWT(config: APNsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 1800) {
    return cachedJwt.token;
  }

  const pemBody = config.privateKeyP8
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  const keyBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = btoa(JSON.stringify({ alg: "ES256", kid: config.keyId }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({ iss: config.teamId, iat: now }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const msg = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, msg);

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const token = `${header}.${payload}.${sigB64}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

// スコア更新プッシュ通知ペイロード（リッチ通知 + Expo 互換）
export interface ScorePushPayload {
  matchId: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  roundInfo: string;
  status: "live" | "completed";
}

// 単一デバイスにスコア更新プッシュを送信（Expo push token と APNs token 両対応）
export async function sendScorePush(
  deviceToken: string,
  payload: ScorePushPayload,
  config: APNsConfig,
): Promise<void> {
  const isCompleted = payload.status === "completed";
  const title = isCompleted
    ? `試合終了: ${payload.team1} ${payload.score1} - ${payload.score2} ${payload.team2}`
    : `${payload.team1} ${payload.score1} - ${payload.score2} ${payload.team2}`;
  const body = isCompleted ? "試合が終了しました" : payload.roundInfo;

  // Expo push token（"ExponentPushToken[...]"）は Expo の API 経由で送信
  if (deviceToken.startsWith("ExponentPushToken")) {
    await sendViaExpoPush(deviceToken, title, body, payload);
    return;
  }

  // 生の APNs デバイストークンは直接送信
  const jwt = await getAPNsJWT(config);
  const apnsBody = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 0,
      "mutable-content": 1,
    },
    matchId: payload.matchId,
    score1: payload.score1,
    score2: payload.score2,
    roundInfo: payload.roundInfo,
    status: payload.status,
  });

  const res = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      authorization: `bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: apnsBody,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`APNs error [${deviceToken.slice(0, 8)}...]: ${res.status} ${err}`);
  }
}

// Expo Push API 経由（ExponentPushToken 用）
async function sendViaExpoPush(
  token: string,
  title: string,
  body: string,
  payload: ScorePushPayload,
): Promise<void> {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: token,
      title,
      body,
      data: { matchId: payload.matchId, score1: payload.score1, score2: payload.score2 },
      sound: "default",
      priority: "high",
    }),
  });
}

// 複数デバイスに並列送信
export async function broadcastScorePush(
  deviceTokens: string[],
  payload: ScorePushPayload,
  config: APNsConfig,
): Promise<void> {
  await Promise.allSettled(
    deviceTokens.map((token) => sendScorePush(token, payload, config)),
  );
}

export function loadAPNsConfig(): APNsConfig {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKeyP8 = Deno.env.get("APNS_PRIVATE_KEY");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");

  if (!keyId || !teamId || !privateKeyP8 || !bundleId) {
    throw new Error("APNs 環境変数が不足しています（APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID）");
  }
  return { keyId, teamId, privateKeyP8, bundleId };
}
