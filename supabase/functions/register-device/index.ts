// register-device Edge Function（依存ゼロ・fetch で PostgREST を直接呼ぶ）
// POST /register-device              – APNs デバイストークン登録
// POST /register-device/webpush      – Web Push サブスクリプション登録
// DELETE /register-device/webpush    – Web Push サブスクリプション削除
// POST /register-device/watch        – ウォッチリスト追加
// DELETE /register-device/watch      – ウォッチリスト削除
// GET  /register-device/watch        – ウォッチリスト取得

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

async function restGet(path: string): Promise<any[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  if (!res.ok) { console.error(`GET ${path} -> ${res.status}`); return []; }
  return res.json();
}

async function restUpsert(table: string, row: unknown, onConflict: string): Promise<boolean> {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: SVC, Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) { console.error(`UPSERT ${table} -> ${res.status}: ${await res.text()}`); return false; }
  return true;
}

async function restDelete(table: string, filter: string): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: "return=minimal" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  try {
    // ── Web Push ──────────────────────────────────────────────
    if (path === "webpush") {
      if (req.method === "POST") {
        const { endpoint, keys } = await req.json();
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          return json({ error: "endpoint / keys が不足" }, 400);
        }
        await restUpsert("push_subscriptions",
          { endpoint, p256dh: keys.p256dh, auth: keys.auth }, "endpoint");
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        const { endpoint } = await req.json();
        if (endpoint) await restDelete("push_subscriptions", `endpoint=eq.${encodeURIComponent(endpoint)}`);
        return json({ ok: true });
      }
    }

    // ── ウォッチリスト（iOS 用）─────────────────────────────────
    if (path === "watch") {
      if (req.method === "GET") {
        const token = url.searchParams.get("deviceToken");
        if (!token) return json({ error: "deviceToken が必要" }, 400);
        const dt = (await restGet(`device_tokens?select=id&device_token=eq.${encodeURIComponent(token)}&limit=1`))[0];
        if (!dt) return json({ watchlist: [] });
        const data = await restGet(`watchlist?select=match_id&device_token_id=eq.${dt.id}`);
        return json({ watchlist: data.map((r: any) => ({ matchId: r.match_id })) });
      }
      if (req.method === "POST") {
        const { deviceToken, matchId } = await req.json();
        if (!deviceToken || !matchId) return json({ error: "deviceToken / matchId が必要" }, 400);
        const dt = (await restGet(`device_tokens?select=id&device_token=eq.${encodeURIComponent(deviceToken)}&limit=1`))[0];
        if (!dt) return json({ error: "device not found" }, 404);
        await restUpsert("watchlist", { device_token_id: dt.id, match_id: matchId }, "device_token_id,match_id");
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        const { deviceToken, matchId } = await req.json();
        const dt = (await restGet(`device_tokens?select=id&device_token=eq.${encodeURIComponent(deviceToken)}&limit=1`))[0];
        if (dt) await restDelete("watchlist", `device_token_id=eq.${dt.id}&match_id=eq.${encodeURIComponent(matchId)}`);
        return json({ ok: true });
      }
    }

    // ── APNs デバイストークン（iOS 用）──────────────────────────
    if (req.method === "POST") {
      const { deviceToken } = await req.json();
      if (!deviceToken) return json({ error: "deviceToken が必要" }, 400);
      await restUpsert("device_tokens",
        { device_token: deviceToken, updated_at: new Date().toISOString() }, "device_token");
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    console.error("register-device error:", e);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
