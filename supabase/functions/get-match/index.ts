// get-match Edge Function（依存ゼロ）
// 試合詳細を vlr.gg からスクレイプして、両チームの選手とエージェント構成を返す。
//
// GET /get-match?matchId=688441
//   → { status, team1:{name,players:[{name,agents:[slug]}]}, team2:{...} }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; ValorantTracker/1.0)" };
const AGENT_IMG_BASE = "https://www.vlr.gg/img/vlr/game/agents/";

function trim(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ").trim();
}

interface Player { name: string; agents: string[]; agentImgs: string[]; }
interface TeamDetail { name: string; players: Player[]; }
interface Stream { url: string; type: string; }

function classifyStream(url: string): string {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/twitch\.tv/i.test(url)) return "twitch";
  return "other";
}

// 配信リンク（YouTube優先、なければTwitch等）を抽出
function parseStreams(html: string): Stream[] {
  const i = html.indexOf("match-streams-container");
  const seg = i >= 0 ? html.slice(i, i + 3000) : "";
  const urls = [...seg.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const seen = new Set<string>();
  const streams: Stream[] = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    streams.push({ url: u, type: classifyStream(u) });
  }
  // YouTube を先頭に
  streams.sort((a, b) => (a.type === "youtube" ? -1 : 0) - (b.type === "youtube" ? -1 : 0));
  return streams;
}

function parseMatch(html: string): { status: string; team1: TeamDetail; team2: TeamDetail; streams: Stream[] } {
  // チーム名（ヘッダ）
  const teamNames = [...html.matchAll(/class="wf-title-med[^"]*"[^>]*>\s*([^<]+?)\s*</g)]
    .map((t) => trim(t[1])).filter(Boolean);

  // ステータス
  let status = "upcoming";
  if (/class="match-header-vs-note[^"]*">\s*live/i.test(html)) status = "live";
  else if (/class="match-header-vs-note[^"]*">\s*final/i.test(html)) status = "completed";

  // スコアボード行 → 選手（出現順、slug で重複排除、エージェントは union）
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const seen = new Map<string, Player>();
  const order: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const pm = row.match(/\/player\/\d+\/([^"]+)"/);
    if (!pm) continue;
    const slug = pm[1];
    const nameM = row.match(/class="text-of"[^>]*>([\s\S]*?)<\/div>/);
    const name = nameM ? trim(nameM[1]) : slug;
    const agents = [...row.matchAll(/agents\/([a-z0-9]+)\.png/g)].map((a) => a[1]);
    if (!seen.has(slug)) { seen.set(slug, { name, agents: [], agentImgs: [] }); order.push(slug); }
    const rec = seen.get(slug)!;
    for (const a of agents) {
      if (!rec.agents.includes(a)) { rec.agents.push(a); rec.agentImgs.push(`${AGENT_IMG_BASE}${a}.png`); }
    }
  }

  const players = order.map((s) => seen.get(s)!);
  // 先頭5 = team1, 次5 = team2（vlr スコアボードの並び）
  const team1: TeamDetail = { name: teamNames[0] ?? "Team 1", players: players.slice(0, 5) };
  const team2: TeamDetail = { name: teamNames[1] ?? "Team 2", players: players.slice(5, 10) };
  const streams = parseStreams(html);
  return { status, team1, team2, streams };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);

  try {
    const url = new URL(req.url);
    const matchId = url.searchParams.get("matchId");
    if (!matchId || !/^\d+$/.test(matchId)) return json({ error: "matchId が必要" }, 400);

    const res = await fetch(`https://www.vlr.gg/${matchId}/`, { headers: FETCH_HEADERS });
    if (!res.ok) return json({ error: `vlr.gg ${res.status}` }, 502);
    const html = await res.text();

    const detail = parseMatch(html);
    return json({ matchId, ...detail });
  } catch (err) {
    console.error("get-match error:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
