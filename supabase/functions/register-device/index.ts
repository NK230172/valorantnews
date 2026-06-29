// register-device Edge Function
// POST /register-device              – APNs デバイストークン登録
// POST /register-device/webpush      – Web Push サブスクリプション登録
// DELETE /register-device/webpush    – Web Push サブスクリプション削除
// POST /register-device/watch        – ウォッチリスト追加
// DELETE /register-device/watch      – ウォッチリスト削除
// GET  /register-device/watch        – ウォッチリスト取得

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

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
        await supabase.from("push_subscriptions").upsert(
          { endpoint, p256dh: keys.p256dh, auth: keys.auth },
          { onConflict: "endpoint" },
        );
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        const { endpoint } = await req.json();
        if (endpoint) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
        return json({ ok: true });
      }
    }

    // ── ウォッチリスト ─────────────────────────────────────────
    if (path === "watch") {
      if (req.method === "GET") {
        const token = url.searchParams.get("deviceToken");
        if (!token) return json({ error: "deviceToken が必要" }, 400);
        const { data: dt } = await supabase.from("device_tokens").select("id").eq("device_token", token).single();
        if (!dt) return json({ watchlist: [] });
        const { data } = await supabase.from("watchlist").select("match_id").eq("device_token_id", dt.id);
        return json({ watchlist: (data ?? []).map((r: any) => ({ matchId: r.match_id })) });
      }
      if (req.method === "POST") {
        const { deviceToken, matchId } = await req.json();
        if (!deviceToken || !matchId) return json({ error: "deviceToken / matchId が必要" }, 400);
        const { data: dt } = await supabase.from("device_tokens").select("id").eq("device_token", deviceToken).single();
        if (!dt) return json({ error: "device not found" }, 404);
        await supabase.from("watchlist").upsert({ device_token_id: dt.id, match_id: matchId });
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        const { deviceToken, matchId } = await req.json();
        const { data: dt } = await supabase.from("device_tokens").select("id").eq("device_token", deviceToken).single();
        if (dt) await supabase.from("watchlist").delete().eq("device_token_id", dt.id).eq("match_id", matchId);
        return json({ ok: true });
      }
    }

    // ── APNs デバイストークン ────────────────────────────────────
    if (req.method === "POST") {
      const { deviceToken } = await req.json();
      if (!deviceToken) return json({ error: "deviceToken が必要" }, 400);
      await supabase.from("device_tokens").upsert(
        { device_token: deviceToken, updated_at: new Date().toISOString() },
        { onConflict: "device_token" },
      );
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
