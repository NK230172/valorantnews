'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getWatchlist, flagEmoji } from '@/lib/api';

interface LiveEntry {
  match_id: string;
  team1_name: string;
  team2_name: string;
  team1_flag: string;
  team2_flag: string;
  team1_score: number;
  team2_score: number;
  round_info: string | null;
}

export default function LiveBar() {
  const [entries, setEntries] = useState<LiveEntry[]>([]);

  const refresh = async () => {
    const wl = getWatchlist();
    if (wl.size === 0) { setEntries([]); return; }

    const { data } = await supabase
      .from('match_scores')
      .select('match_id, team1_name, team2_name, team1_score, team2_score, round_info')
      .eq('status', 'live')
      .in('match_id', [...wl]);

    // match_scores に flag が無いので match_schedule から補完
    const { data: sched } = await supabase
      .from('match_schedule')
      .select('match_id, team1_flag, team2_flag')
      .in('match_id', (data ?? []).map((r) => r.match_id));

    const flagMap = new Map((sched ?? []).map((s) => [s.match_id, s]));
    setEntries(
      (data ?? []).map((r) => ({
        ...r,
        team1_flag: flagMap.get(r.match_id)?.team1_flag ?? '',
        team2_flag: flagMap.get(r.match_id)?.team2_flag ?? '',
      }))
    );
  };

  useEffect(() => {
    refresh();

    // Supabase Realtime でスコア変化を購読
    const channel = supabase
      .channel('livebar_scores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_scores' },
        () => { refresh(); },
      )
      .subscribe();

    // ウォッチリスト変更を検知するためストレージイベントも監視
    const onStorage = () => refresh();
    window.addEventListener('storage', onStorage);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-val-red/95 backdrop-blur-sm border-t border-red-400/30 shadow-2xl">
      <div className="flex items-center overflow-x-auto scrollbar-hide gap-0 divide-x divide-red-400/30">
        <div className="shrink-0 px-3 py-2">
          <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest">
            LIVE
          </span>
        </div>
        {entries.map((e) => (
          <div key={e.match_id} className="flex items-center gap-2 px-4 py-2 shrink-0">
            <span className="text-xs text-white font-semibold">
              {flagEmoji(e.team1_flag)}{e.team1_name}
            </span>
            <span className="text-white font-bold tabular-nums">
              {e.team1_score}
              <span className="mx-1 opacity-60">-</span>
              {e.team2_score}
            </span>
            <span className="text-xs text-white font-semibold">
              {e.team2_name}{flagEmoji(e.team2_flag)}
            </span>
            {e.round_info && (
              <span className="text-[10px] text-white/60 ml-1">{e.round_info}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
