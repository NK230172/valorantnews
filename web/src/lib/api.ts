export type TournamentFilter = 'all' | 'vct' | 'vcj' | 'enc';

export const TOURNAMENT_LABELS: Record<TournamentFilter, string> = {
  all: 'すべて',
  vct: 'VCT',
  vcj: 'VCJ',
  enc: 'ENC',
};

export interface LiveScore {
  match_id: string;
  team1_score: number;
  team2_score: number;
  round_info: string | null;
  status: string;
}

export interface Match {
  matchId: string;
  tournament: string;
  eventName: string;
  team1Name: string;
  team2Name: string;
  team1Flag: string;
  team2Flag: string;
  matchTime: string | null;
  status: 'live' | 'upcoming' | 'completed';
  matchPage: string | null;
  liveScore: LiveScore | null;
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1';
const KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export async function fetchSchedule(tournament: TournamentFilter = 'all'): Promise<Match[]> {
  let path = 'get-schedule?status=active';
  if (tournament !== 'all') path += `&tournament=${tournament}`;
  const data = await api<{ matches: Match[] }>(path);
  return data.matches ?? [];
}

// ── ウォッチリスト (localStorage) ──────────────────────────
const WL_KEY = 'val_watchlist_v1';

export function getWatchlist(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(WL_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function toggleWatchlist(matchId: string): Set<string> {
  const wl = getWatchlist();
  if (wl.has(matchId)) wl.delete(matchId);
  else wl.add(matchId);
  localStorage.setItem(WL_KEY, JSON.stringify([...wl]));
  return new Set(wl);
}

// ── 国旗絵文字 ─────────────────────────────────────────────
export function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '';
  const BASE_CP = 0x1F1E6 - 65;
  return String.fromCodePoint(
    code.toUpperCase().charCodeAt(0) + BASE_CP,
    code.toUpperCase().charCodeAt(1) + BASE_CP,
  );
}
