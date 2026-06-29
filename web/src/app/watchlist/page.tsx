'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Match, LiveScore, fetchSchedule, getWatchlist, toggleWatchlist } from '@/lib/api';
import MatchRow from '@/components/MatchRow';

export default function WatchlistPage() {
  const [matches,  setMatches]  = useState<Match[]>([]);
  const [watched,  setWatched]  = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const liveScores = useState<Map<string, LiveScore>>(() => new Map())[0];

  const load = useCallback(async () => {
    setLoading(true);
    const wl = getWatchlist();
    setWatched(wl);
    if (wl.size === 0) { setMatches([]); setLoading(false); return; }
    try {
      const all = await fetchSchedule();
      setMatches(all.filter((m) => wl.has(m.matchId)));
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime スコア更新
  useEffect(() => {
    const ch = supabase
      .channel('watchlist_scores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_scores' },
        // deno-lint-ignore no-explicit-any
        (payload: any) => {
          const row = payload.new as LiveScore & { match_id: string };
          if (!row?.match_id) return;
          liveScores.set(row.match_id, row);
          setMatches((prev) =>
            prev.map((m) =>
              m.matchId === row.match_id
                ? { ...m, status: row.status as Match['status'], liveScore: row }
                : m
            )
          );
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [liveScores]);

  const handleToggle = (match: Match) => {
    const next = toggleWatchlist(match.matchId);
    setWatched(next);
    setMatches((prev) => prev.filter((m) => next.has(m.matchId)));
    window.dispatchEvent(new Event('storage'));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-val-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-val-muted gap-2">
        <p className="text-lg">ウォッチリストが空です</p>
        <p className="text-sm">スケジュール画面で試合に ★ を付けると追加されます</p>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 pt-4 pb-2">
        <span className="text-xs font-bold text-val-muted tracking-widest uppercase">
          ウォッチ中 ({watched.size})
        </span>
      </div>
      {matches.map((m) => (
        <MatchRow
          key={m.matchId}
          match={m}
          isWatched
          liveOverride={liveScores.get(m.matchId) ?? null}
          onToggle={() => handleToggle(m)}
        />
      ))}
    </>
  );
}
