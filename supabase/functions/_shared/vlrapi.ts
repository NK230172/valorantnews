// vlr.gg 直接スクレイパー
// vlrggapi.vercel.app が停止したため vlr.gg を直接 HTML パース

const VLR_BASE = "https://www.vlr.gg";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; ValorantTracker/1.0)" };

export interface VlrMatch {
  match_id: string;
  team1: string;
  team2: string;
  flag1: string;
  flag2: string;
  score1: number;        // map wins（LIVE 中）
  score2: number;
  status: "live" | "upcoming" | "completed";
  eta: string;           // "21m" | "LIVE" | ""
  round_info: string;    // ラウンド/マップ情報（詳細ページから取得）
  tournament_name: string;
  event_series: string;
  match_page: string;    // "/123456/team-a-vs-team-b-..."
}

// ── ヘルパー ──────────────────────────────────────────────────

function trimHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&ndash;/g, "–").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function extractFlag(block: string): string {
  const m = block.match(/class="flag mod-([a-z]{2})"/);
  return m ? m[1] : "";
}

// match-item ブロック 1件をパースして VlrMatch を返す
function parseMatchBlock(href: string, block: string): VlrMatch | null {
  const matchIdM = href.match(/^\/(\d+)\//);
  if (!matchIdM) return null;
  const match_id = matchIdM[1];

  // チーム名（.match-item-vs-team-name > .text-of）
  const teamNames: string[] = [];
  const teamRegex = /class="match-item-vs-team-name"[\s\S]*?class="text-of">([\s\S]*?)<\/div>/g;
  let tm: RegExpExecArray | null;
  while ((tm = teamRegex.exec(block)) !== null && teamNames.length < 2) {
    teamNames.push(trimHtml(tm[1]));
  }
  if (teamNames.length < 2) return null;

  // フラグ（2つ）
  const flagRegex = /class="flag mod-([a-z]{2,3})"/g;
  const flags: string[] = [];
  let fm: RegExpExecArray | null;
  while ((fm = flagRegex.exec(block)) !== null && flags.length < 2) {
    flags.push(fm[1]);
  }

  // スコア（.match-item-vs-team-score）
  const scoreRegex = /class="match-item-vs-team-score[^"]*">\s*([\d–-]+)\s*<\/div>/g;
  const rawScores: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = scoreRegex.exec(block)) !== null && rawScores.length < 2) {
    rawScores.push(sm[1].trim());
  }
  const score1 = parseInt(rawScores[0] ?? "0") || 0;
  const score2 = parseInt(rawScores[1] ?? "0") || 0;

  // ステータス（.ml-status）
  const statusM = block.match(/class="ml-status">\s*(.*?)\s*<\/div>/);
  const statusText = statusM ? statusM[1].trim() : "Upcoming";
  const status: VlrMatch["status"] =
    statusText === "LIVE" ? "live" :
    statusText === "Completed" ? "completed" : "upcoming";

  // ETA（.ml-eta）
  const etaM = block.match(/class="ml-eta">\s*(.*?)\s*<\/div>/);
  const eta = etaM ? etaM[1].trim() : "";

  // トーナメント名（.match-item-event）・シリーズ
  // 構造: <div class="match-item-event text-of"><div class="...series...">XXX</div>トーナメント名</div>
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
    match_id,
    team1: teamNames[0],
    team2: teamNames[1],
    flag1: flags[0] ?? "",
    flag2: flags[1] ?? "",
    score1,
    score2,
    status,
    eta,
    round_info: status === "live" ? `Map ${score1 + score2 + 1}` : "",
    tournament_name,
    event_series,
    match_page: href,
  };
}

// vlr.gg/matches を取得してパース
async function fetchMatchList(url: string): Promise<VlrMatch[]> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`vlr.gg fetch failed: ${res.status} ${url}`);
  const html = await res.text();

  const matches: VlrMatch[] = [];

  // <a href="/数字/..." class="...match-item..."> のブロックを列挙
  const blockRegex = /<a\s+href="(\/\d+\/[^"]+)"[^>]*class="[^"]*wf-module-item match-item[^"]*">([\s\S]*?)<\/a>\s*<\/div>/g;
  let bm: RegExpExecArray | null;
  while ((bm = blockRegex.exec(html)) !== null) {
    const parsed = parseMatchBlock(bm[1], bm[2]);
    if (parsed) matches.push(parsed);
  }

  return matches;
}

// 公開 API ─────────────────────────────────────────────────────

export async function fetchLiveScores(): Promise<VlrMatch[]> {
  const all = await fetchMatchList(`${VLR_BASE}/matches`);
  return all.filter((m) => m.status === "live");
}

export async function fetchUpcomingMatches(): Promise<VlrMatch[]> {
  const all = await fetchMatchList(`${VLR_BASE}/matches`);
  return all.filter((m) => m.status === "upcoming");
}

export async function fetchAllMatches(): Promise<VlrMatch[]> {
  return fetchMatchList(`${VLR_BASE}/matches`);
}

export function extractMatchId(matchPage: string): string {
  const m = matchPage.match(/^\/(\d+)\//);
  return m ? m[1] : matchPage.replace(/^\//, "").split("/")[0];
}

const TARGET_KEYWORDS = ["vct", "vcj", "esports nations", "valorant champions"];
export function isTargetTournament(name: string): boolean {
  const lower = name.toLowerCase();
  return TARGET_KEYWORDS.some((kw) => lower.includes(kw));
}
