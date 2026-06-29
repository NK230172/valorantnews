// get-schedule Edge Function
// PostgREST をバイパスして Management API の SQL エンドポイントを使用

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const TOURNAMENT_KEYWORDS: Record<string, string> = {
  vct: "vct",
  vcj: "vcj",
  enc: "esports nations cup",
};

async function runSql(sql: string): Promise<any[]> {
  const mgmtPat = Deno.env.get("MGMT_PAT")!;
  const projectRef = Deno.env.get("PROJECT_REF")!;

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${mgmtPat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SQL query failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  if (data.message) throw new Error(data.message);
  return Array.isArray(data) ? data : [];
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

    // status フィルタ
    let statusClause = "";
    if (statusFilter === "active") {
      statusClause = "WHERE status IN ('upcoming','live')";
    } else if (statusFilter !== "all") {
      statusClause = `WHERE status = '${statusFilter.replace(/'/g, "''")}'`;
    }

    const scheduleRows = await runSql(
      `SELECT match_id, tournament, event_name, team1_name, team2_name,
              team1_flag, team2_flag, match_time, status, match_page, cached_at
       FROM match_schedule
       ${statusClause}
       ORDER BY match_time ASC NULLS LAST
       LIMIT 100`,
    );

    const liveRows = await runSql(
      `SELECT match_id, team1_score, team2_score, round_info, status, updated_at
       FROM match_scores
       WHERE status = 'live'`,
    );

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
