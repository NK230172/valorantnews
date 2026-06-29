// get-schedule Edge Function
// 依存ゼロ（Management API デプロイは外部 import を解決できないため fetch で PostgREST を直接呼ぶ）
//
// GET /get-schedule?tournament=vct&status=upcoming
//   tournament: vct | vcj | enc | all （省略時 all）
//   status:     upcoming | live | completed | active | all （省略時 active = upcoming+live）

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

const TOURNAMENT_KEYWORDS: Record<string, string> = {
  vct: "vct",
  vcj: "vcj",
  enc: "esports nations cup",
};

async function rest(path: string): Promise<any[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") return json({ error: "GET only" }, 405);

  try {
    const url = new URL(req.url);
    const tournamentFilter = url.searchParams.get("tournament") ?? "all";
    const statusFilter = url.searchParams.get("status") ?? "active";

    let statusQuery = "";
    if (statusFilter === "active") {
      statusQuery = "&status=in.(upcoming,live)";
    } else if (statusFilter !== "all") {
      statusQuery = `&status=eq.${encodeURIComponent(statusFilter)}`;
    }

    const scheduleRows = await rest(
      `match_schedule?select=*&order=match_time.asc.nullslast&limit=100${statusQuery}`,
    );

    const liveRows = await rest(`match_scores?select=*&status=eq.live`);
    const liveMap = new Map(liveRows.map((r: any) => [r.match_id, r]));

    let matches = scheduleRows.map((s: any) => ({
      matchId: s.match_id,
      tournament: s.tournament,
      eventName: s.event_name,
      team1Name: s.team1_name,
      team2Name: s.team2_name,
      team1Flag: s.team1_flag,
      team2Flag: s.team2_flag,
      matchTime: s.match_time,
      status: s.status,
      matchPage: s.match_page,
      liveScore: liveMap.get(s.match_id) ?? null,
    }));

    if (tournamentFilter !== "all") {
      const kw = TOURNAMENT_KEYWORDS[tournamentFilter.toLowerCase()];
      if (kw) {
        matches = matches.filter((m: any) =>
          m.tournament?.toLowerCase().includes(kw)
        );
      }
    }

    return json({ matches, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("get-schedule error:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
