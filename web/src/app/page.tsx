'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Match, LiveScore, TournamentFilter, TOURNAMENT_LABELS,
  fetchSchedule, getWatchlist, toggleWatchlist,
} from '@/lib/api';
import { syncWatchToServer } from '@/lib/notifications';
import MatchRow from '@/components/MatchRow';

const FILTERS: TournamentFilter[] = [
  'all', 'vct-amer', 'vct-emea', 'vct-pacific', 'vct-china', 'vcj',
];

export default function SchedulePage() {
  const [matches,   setMatches]   = useState<Match[]>([]);
  const [filter,    setFilter]    = useState<TournamentFilter>('all');
  const [watched,   setWatched]   = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const liveMap = useRef<Map<string, LiveScore>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSchedule(filter);
      setMatches(data);
    } catch {
      setError('データの取得に失敗しました。再試行してください。');
    } finally {
      setLoading(false);
    }
    setWatched(getWatchlist());
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Supabase Realtime でスコアをリアルタイム反映
  useEffect(() => {
    const ch = supabase
      .channel('schedule_scores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_scores' },
        // deno-lint-ignore no-explicit-any
        (payload: any) => {
          const row = payload.new as LiveScore & { match_id: string };
          if (!row?.match_id) return;
          liveMap.current.set(row.match_id, row);
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
  }, []);

  const handleToggle = (match: Match) => {
    const willAdd = !watched.has(match.matchId);
    const next = toggleWatchlist(match.matchId);
    setWatched(next);
    syncWatchToServer(match.matchId, willAdd); // 通知対象をサーバー同期
    // LiveBar が storage event を検知して更新
    window.dispatchEvent(new Event('storage'));
  };

  const live     = matches.filter((m) => m.status === 'live');
  const upcoming = matches.filter((m) => m.status === 'upcoming');

  return (
    <>
      {/* 大会フィルタ */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide bg-val-bg sticky top-[49px] z-30 border-b border-val-border">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold shrink-0 transition-colors ${
              filter === f
                ? 'bg-val-red text-white'
                : 'bg-val-card text-val-muted hover:text-val-text'
            }`}
          >
            {TOURNAMENT_LABELS[f]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-val-red border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-val-muted text-sm">{error}</p>
          <button
            onClick={load}
            className="px-4 py-2 text-sm font-semibold text-val-red border border-val-red rounded-lg"
          >
            再試行
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* LIVE セクション */}
          {live.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <span className="w-2 h-2 rounded-full bg-val-red animate-pulse" />
                <span className="text-xs font-bold text-val-muted tracking-widest uppercase">Live</span>
              </div>
              {live.map((m) => (
                <MatchRow
                  key={m.matchId}
                  match={m}
                  isWatched={watched.has(m.matchId)}
                  liveOverride={liveMap.current.get(m.matchId) ?? null}
                  onToggle={() => handleToggle(m)}
                />
              ))}
            </>
          )}

          {/* 予定セクション */}
          {upcoming.length > 0 && (
            <>
              <div className="px-4 pt-4 pb-2">
                <span className="text-xs font-bold text-val-muted tracking-widest uppercase">予定</span>
              </div>
              {upcoming.map((m) => (
                <MatchRow
                  key={m.matchId}
                  match={m}
                  isWatched={watched.has(m.matchId)}
                  onToggle={() => handleToggle(m)}
                />
              ))}
            </>
          )}

          {live.length === 0 && upcoming.length === 0 && (
            <div className="flex flex-col items-center py-20 text-val-muted gap-2">
              <p className="text-lg">試合がありません</p>
              <p className="text-sm">別の大会フィルタを試してください</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
