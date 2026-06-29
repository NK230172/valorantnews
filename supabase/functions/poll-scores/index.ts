// poll-scores: vlr.gg からスコアを取得して DB に反映
// 依存ゼロの単一ファイル（Management API デプロイは外部 import を解決できない）
// DB アクセスは fetch で PostgREST を直接呼ぶ（service_role キーで RLS バイパス）

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── PostgREST ヘルパー ─────────────────────────────────────────
async function restGet(path: string): Promise<any[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  if (!res.ok) { console.error(`GET ${path} -> ${res.status}: ${await res.text()}`); return []; }
  return res.json();
}

async function restUpsert(table: string, rows: unknown[], onConflict: string): Promise<void> {
  if ((rows as unknown[]).length === 0) return;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: SVC, Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) console.error(`UPSERT ${table} -> ${res.status}: ${await res.text()}`);
}

async function restPatch(table: string, filter: string, patch: unknown): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: SVC, Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.error(`PATCH ${table} -> ${res.status}: ${await res.text()}`);
}

async function restDelete(table: string, filter: string): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: "return=minimal" },
  });
}

// ── VLR API ────────────────────────────────────────────────────
const VLR_BASE = "https://www.vlr.gg";
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; ValorantTracker/1.0)" };

interface VlrMatch {
  match_id: string;
  team1: string; team2: string;
  flag1: string; flag2: string;
  score1: number; score2: number;
  status: "live" | "upcoming" | "completed";
  eta: string; round_info: string;
  tournament_name: string; event_series: string;
  match_page: string;
}

function trimHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&ndash;/g, "–").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function parseMatchBlock(href: string, block: string): VlrMatch | null {
  const matchIdM = href.match(/^\/(\d+)\//);
  if (!matchIdM) return null;
  const match_id = matchIdM[1];

  const teamNames: string[] = [];
  const teamRegex = /class="match-item-vs-team-name"[\s\S]*?class="text-of">([\s\S]*?)<\/div>/g;
  let tm: RegExpExecArray | null;
  while ((tm = teamRegex.exec(block)) !== null && teamNames.length < 2) {
    teamNames.push(trimHtml(tm[1]));
  }
  if (teamNames.length < 2) return null;

  const flagRegex = /class="flag mod-([a-z]{2,3})"/g;
  const flags: string[] = [];
  let fm: RegExpExecArray | null;
  while ((fm = flagRegex.exec(block)) !== null && flags.length < 2) {
    flags.push(fm[1]);
  }

  const scoreRegex = /class="match-item-vs-team-score[^"]*">\s*([\d–-]+)\s*<\/div>/g;
  const rawScores: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = scoreRegex.exec(block)) !== null && rawScores.length < 2) {
    rawScores.push(sm[1].trim());
  }
  const score1 = parseInt(rawScores[0] ?? "0") || 0;
  const score2 = parseInt(rawScores[1] ?? "0") || 0;

  const statusM = block.match(/class="ml-status">\s*(.*?)\s*<\/div>/);
  const statusText = statusM ? statusM[1].trim() : "Upcoming";
  const status: VlrMatch["status"] =
    statusText === "LIVE" ? "live" :
    statusText === "Completed" ? "completed" : "upcoming";

  const etaM = block.match(/class="ml-eta">\s*(.*?)\s*<\/div>/);
  const eta = etaM ? etaM[1].trim() : "";

  const eventBlockM = block.match(
    /class="match-item-event text-of">([\s\S]*?)<\/div>\s*<\/div>/
  );
  let tournament_name = "";
  let event_series = "";
  if (eventBlockM) {
    const raw = eventBlockM[1];
    const seriesM = raw.match(/class="match-item-event-series text-of">([\s\S]*?)<\/div>/);
    event_series = seriesM ? trimHtml(seriesM[1]) : "";
    const noSeries = raw.replace(/<div[^>]*match-item-event-series[^>]*>[\s\S]*?<\/div>/, "");
    tournament_name = trimHtml(noSeries);
  }

  return {
    match_id, team1: teamNames[0], team2: teamNames[1],
    flag1: flags[0] ?? "", flag2: flags[1] ?? "",
    score1, score2, status, eta,
    round_info: status === "live" ? `Map ${score1 + score2 + 1}` : "",
    tournament_name, event_series, match_page: href,
  };
}

async function fetchAllMatches(): Promise<VlrMatch[]> {
  const res = await fetch(`${VLR_BASE}/matches`, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`vlr.gg fetch failed: ${res.status}`);
  const html = await res.text();
  const matches: VlrMatch[] = [];
  const blockRegex = /<a\s+href="(\/\d+\/[^"]+)"[^>]*class="[^"]*wf-module-item match-item[^"]*">([\s\S]*?)<\/a>\s*<\/div>/g;
  let bm: RegExpExecArray | null;
  while ((bm = blockRegex.exec(html)) !== null) {
    const parsed = parseMatchBlock(bm[1], bm[2]);
    if (parsed) matches.push(parsed);
  }
  return matches;
}

function extractMatchId(matchPage: string): string {
  const m = matchPage.match(/^\/(\d+)\//);
  return m ? m[1] : matchPage.replace(/^\//, "").split("/")[0];
}

// すべての Valorant 大会を追跡（vlr.gg/matches に出る試合をそのまま保存）
function isTargetTournament(_name: string): boolean { return true; }

// ── Web Push (VAPID) ──────────────────────────────────────────
interface WebPushSub { endpoint: string; p256dh: string; auth: string; }
interface VapidKeys { publicKey: string; privateKeyPkcs8: string; }

function loadVapidKeys(): VapidKeys | null {
  const pub  = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return null;
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

async function sendWebPush(sub: WebPushSub, keys: VapidKeys): Promise<void> {
  try {
    const { protocol, host } = new URL(sub.endpoint);
    const now = Math.floor(Date.now() / 1000);
    const hdr = textB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
    const pay = textB64url(JSON.stringify({ aud: `${protocol}//${host}`, exp: now + 43200, sub: "mailto:noreply@valtracker.app" }));
    const privBytes = b64urlDecode(keys.privateKeyPkcs8);
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8", privBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, new TextEncoder().encode(`${hdr}.${pay}`));
    const jwt = `${hdr}.${pay}.${b64urlEncode(sig)}`;
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: { Authorization: `vapid t=${jwt},k=${keys.publicKey}`, TTL: "86400", "Content-Length": "0" },
    });
    if (res.status === 404 || res.status === 410) {
      await restDelete("push_subscriptions", `endpoint=eq.${encodeURIComponent(sub.endpoint)}`);
    }
  } catch (e) {
    console.error("WebPush error:", e);
  }
}

async function broadcastWebPush(keys: VapidKeys): Promise<void> {
  const subs = await restGet("push_subscriptions?select=endpoint,p256dh,auth");
  if (subs.length > 0) {
    await Promise.allSettled(subs.map((s: any) => sendWebPush(s as WebPushSub, keys)));
  }
}

// ── Main ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const vapidKeys = loadVapidKeys();
    const allMatches = await fetchAllMatches();
    const targetMatches = allMatches.filter((m) => isTargetTournament(m.tournament_name));
    const targetLive = targetMatches.filter((m) => m.status === "live");

    await upsertSchedule(targetMatches);

    let pushCount = 0;
    let anyChanged = false;
    for (const match of targetLive) {
      const changed = await processLiveMatch(match, extractMatchId(match.match_page));
      if (changed) { pushCount++; anyChanged = true; }
    }

    const liveIds = new Set(targetLive.map((m) => extractMatchId(m.match_page)));
    const completedChanged = await markCompleted(liveIds);
    if (completedChanged) anyChanged = true;

    if (anyChanged && vapidKeys) {
      await broadcastWebPush(vapidKeys);
    }

    return new Response(
      JSON.stringify({ ok: true, live: targetLive.length, pushed: pushCount }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("poll-scores error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

async function processLiveMatch(match: VlrMatch, matchId: string): Promise<boolean> {
  const prevRows = await restGet(
    `match_scores?select=team1_score,team2_score,status&match_id=eq.${encodeURIComponent(matchId)}&limit=1`,
  );
  const prev = prevRows[0] ?? null;

  const scoreChanged =
    !prev ||
    prev.team1_score !== match.score1 ||
    prev.team2_score !== match.score2 ||
    prev.status !== "live";

  await restUpsert("match_scores", [{
    match_id: matchId,
    tournament: match.tournament_name,
    team1_name: match.team1,
    team2_name: match.team2,
    team1_score: match.score1,
    team2_score: match.score2,
    status: "live",
    round_info: match.round_info,
    updated_at: new Date().toISOString(),
  }], "match_id");

  return scoreChanged;
}

async function markCompleted(currentLiveIds: Set<string>): Promise<boolean> {
  const liveRows = await restGet(`match_scores?select=match_id&status=eq.live`);
  let changed = false;
  for (const row of liveRows) {
    if (currentLiveIds.has(row.match_id)) continue;
    await restPatch(
      "match_scores",
      `match_id=eq.${encodeURIComponent(row.match_id)}`,
      { status: "completed", updated_at: new Date().toISOString() },
    );
    changed = true;
  }
  return changed;
}

async function upsertSchedule(matches: VlrMatch[]): Promise<void> {
  if (matches.length === 0) return;
  const now = new Date().toISOString();
  const rows = matches.map((m) => {
    const matchId = extractMatchId(m.match_page);
    const tour = m.tournament_name || m.event_series || "";
    return {
      match_id: matchId,
      tournament: tour,
      event_name: tour,
      team1_name: m.team1,
      team2_name: m.team2,
      team1_flag: m.flag1,
      team2_flag: m.flag2,
      match_time: null,
      status: m.status,
      match_page: m.match_page,
      cached_at: now,
    };
  });
  await restUpsert("match_schedule", rows, "match_id");
}
