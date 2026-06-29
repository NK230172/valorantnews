// poll-scores: vlr.gg からスコアを取得して DB に反映
// 全依存をインライン（Management API 経由で PostgREST バイパス）

// ── VLR API ────────────────────────────────────────────────────
const VLR_BASE = "https://www.vlr.gg";
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; ValorantTracker/1.0)" };

interface VlrMatch {
  match_id: string;
  team1: string;
  team2: string;
  flag1: string;
  flag2: string;
  score1: number;
  score2: number;
  status: "live" | "upcoming" | "completed";
  eta: string;
  round_info: string;
  tournament_name: string;
  event_series: string;
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

// VCT エコシステム全体（Challengers, Game Changers を含む）
const TARGET_KEYWORDS = ["vct", "vcj", "challengers", "game changers", "esports nations", "valorant champions"];
function isTargetTournament(_name: string): boolean {
  return true; // すべての Valorant 大会を追跡
}

// ── Web Push ──────────────────────────────────────────────────
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
    await fetch(sub.endpoint, {
      method: "POST",
      headers: { Authorization: `vapid t=${jwt},k=${keys.publicKey}`, TTL: "86400", "Content-Length": "0" },
    });
  } catch (e) {
    console.error("WebPush error:", e);
  }
}

// ── Management API SQL ─────────────────────────────────────────
async function runSql(sql: string): Promise<any[]> {
  const mgmtPat = Deno.env.get("MGMT_PAT")!;
  const projectRef = Deno.env.get("PROJECT_REF")!;
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${mgmtPat}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) { console.error(`SQL failed ${res.status}: ${await res.text()}`); return []; }
  const data = await res.json();
  if (data.message) { console.error("SQL error:", data.message); return []; }
  return Array.isArray(data) ? data : [];
}

function esc(s: string): string { return (s ?? "").replace(/'/g, "''"); }

// ── Main ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const vapidKeys = loadVapidKeys();
    const allMatches = await fetchAllMatches();
    const liveMatches = allMatches.filter((m) => m.status === "live");
    const targetLive = liveMatches.filter((m) => isTargetTournament(m.tournament_name));

    // スケジュール upsert
    await upsertSchedule(allMatches.filter((m) => isTargetTournament(m.tournament_name)));

    let pushCount = 0;
    for (const match of targetLive) {
      const changed = await processLiveMatch(match, extractMatchId(match.match_page), vapidKeys);
      if (changed) pushCount++;
    }

    // 終了済み試合をマーク
    const liveIds = new Set(targetLive.map((m) => extractMatchId(m.match_page)));
    await markCompleted(liveIds, vapidKeys);

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

async function processLiveMatch(match: VlrMatch, matchId: string, vapidKeys: VapidKeys | null): Promise<boolean> {
  const mid = esc(matchId);
  const prev = (await runSql(`SELECT team1_score, team2_score, status FROM match_scores WHERE match_id = '${mid}'`))[0] ?? null;

  const scoreChanged = !prev || prev.team1_score !== match.score1 || prev.team2_score !== match.score2 || prev.status !== "live";

  const now = new Date().toISOString();
  await runSql(
    `INSERT INTO match_scores (match_id, tournament, team1_name, team2_name, team1_score, team2_score, status, round_info, updated_at)
     VALUES ('${mid}','${esc(match.tournament_name)}','${esc(match.team1)}','${esc(match.team2)}',${match.score1},${match.score2},'live','${esc(match.round_info)}','${now}')
     ON CONFLICT (match_id) DO UPDATE SET team1_score=EXCLUDED.team1_score, team2_score=EXCLUDED.team2_score, status='live', round_info=EXCLUDED.round_info, updated_at=EXCLUDED.updated_at`
  );

  if (!scoreChanged) return false;

  if (vapidKeys) {
    const webSubs = await runSql(`SELECT endpoint, p256dh, auth FROM push_subscriptions`);
    if (webSubs.length > 0) {
      await Promise.allSettled(webSubs.map((s: any) => sendWebPush(s as WebPushSub, vapidKeys!)));
    }
  }
  return true;
}

async function markCompleted(currentLiveIds: Set<string>, vapidKeys: VapidKeys | null): Promise<void> {
  const liveRows = await runSql(`SELECT match_id FROM match_scores WHERE status = 'live'`);
  const now = new Date().toISOString();
  let pushed = false;
  for (const row of liveRows) {
    if (currentLiveIds.has(row.match_id)) continue;
    const mid = esc(row.match_id);
    await runSql(`UPDATE match_scores SET status='completed', updated_at='${now}' WHERE match_id='${mid}'`);
    if (vapidKeys && !pushed) {
      const webSubs = await runSql(`SELECT endpoint, p256dh, auth FROM push_subscriptions`);
      if (webSubs.length > 0) {
        await Promise.allSettled(webSubs.map((s: any) => sendWebPush(s as WebPushSub, vapidKeys!)));
        pushed = true;
      }
    }
  }
}

async function upsertSchedule(matches: VlrMatch[]): Promise<void> {
  if (matches.length === 0) return;
  const now = new Date().toISOString();
  for (const m of matches) {
    const mid = esc(extractMatchId(m.match_page));
    const tour = esc(m.tournament_name || m.event_series || "");
    await runSql(
      `INSERT INTO match_schedule (match_id, tournament, event_name, team1_name, team2_name, team1_flag, team2_flag, match_time, status, match_page, cached_at)
       VALUES ('${mid}','${tour}','${tour}','${esc(m.team1)}','${esc(m.team2)}','${esc(m.flag1)}','${esc(m.flag2)}',NULL,'${m.status}','${esc(m.match_page)}','${now}')
       ON CONFLICT (match_id) DO UPDATE SET tournament=EXCLUDED.tournament, event_name=EXCLUDED.event_name, team1_name=EXCLUDED.team1_name, team2_name=EXCLUDED.team2_name, team1_flag=EXCLUDED.team1_flag, team2_flag=EXCLUDED.team2_flag, status=EXCLUDED.status, match_page=EXCLUDED.match_page, cached_at=EXCLUDED.cached_at`
    );
  }
}
