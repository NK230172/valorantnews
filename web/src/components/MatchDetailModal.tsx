'use client';

import { useEffect, useState } from 'react';
import { MatchDetail, MatchTeamDetail, fetchMatchDetail, flagEmoji, minutesSince } from '@/lib/api';

interface Props {
  matchId: string;
  team1Name: string;
  team2Name: string;
  team1Flag?: string;
  team2Flag?: string;
  isLive: boolean;
  matchTime?: string | null;
  onClose: () => void;
}

function TeamColumn({ team, flag }: { team: MatchTeamDetail; flag?: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-val-border">
        {flag && <span className="text-base">{flagEmoji(flag)}</span>}
        <span className="text-sm font-bold text-val-text truncate">{team.name}</span>
      </div>
      <div className="divide-y divide-val-border/50">
        {team.players.length === 0 && (
          <div className="px-3 py-4 text-xs text-val-muted">ロスター未発表</div>
        )}
        {team.players.map((p, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <div className="flex gap-0.5 shrink-0">
              {p.agents.length > 0 ? (
                p.agents.map((slug, j) => (
                  // プロキシ経由（vlrの直リンクは403になるため）
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={j} src={`/api/agent/${slug}`} alt={slug} title={slug}
                       className="w-6 h-6 rounded-sm bg-val-bg" />
                ))
              ) : (
                <span className="w-6 h-6 rounded-sm bg-val-bg/60 inline-block" />
              )}
            </div>
            <span className="text-sm text-val-text truncate">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchDetailModal({
  matchId, team1Name, team2Name, team1Flag, team2Flag, isLive, matchTime, onClose,
}: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMatchDetail(matchId)
      .then((d) => { if (active) setDetail(d); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [matchId]);

  // ライブ中は15秒ごとに更新（エージェント構成の反映）
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => {
      fetchMatchDetail(matchId).then((d) => setDetail(d)).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [matchId, isLive]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-val-card border-t sm:border border-val-border sm:rounded-xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダ */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-val-border sticky top-0 bg-val-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-val-text">
            {isLive && <span className="text-[9px] font-bold text-val-red animate-pulse">● LIVE</span>}
            <span className="truncate">{team1Name} vs {team2Name}</span>
          </div>
          <button onClick={onClose} className="text-val-muted hover:text-val-text text-xl leading-none px-2">×</button>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-val-red border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="py-12 text-center text-sm text-val-muted">詳細を取得できませんでした</div>
        )}
        {detail && !loading && (
          <>
            {(() => {
              const hasAgents = [...detail.team1.players, ...detail.team2.players]
                .some((p) => p.agents.length > 0);
              const elapsed = minutesSince(matchTime ?? null);
              const dataUnavailable = isLive && !hasAgents && elapsed !== null && elapsed > 20;
              if (!dataUnavailable) return null;
              return (
                <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-xs">
                  この大会はリアルタイム集計に対応していないため、マップ・ラウンド・エージェント構成は表示できません。配信でご確認ください。
                </div>
              );
            })()}
            {/* 配信リンク */}
            {detail.streams && detail.streams.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 py-3 border-b border-val-border">
                {detail.streams.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                      s.type === 'youtube'
                        ? 'bg-[#FF0000] text-white'
                        : s.type === 'twitch'
                        ? 'bg-[#9146FF] text-white'
                        : 'bg-val-bg text-val-text'
                    }`}
                  >
                    {s.type === 'youtube' ? '▶ YouTube' : s.type === 'twitch' ? '▶ Twitch' : '▶ 配信'}
                  </a>
                ))}
              </div>
            )}
            <div className="flex divide-x divide-val-border">
              <TeamColumn team={detail.team1} flag={team1Flag} />
              <TeamColumn team={detail.team2} flag={team2Flag} />
            </div>
            <div className="px-4 py-2 text-[10px] text-val-muted text-center">
              {(() => {
                const hasAgents = [...detail.team1.players, ...detail.team2.players]
                  .some((p) => p.agents.length > 0);
                const elapsed = minutesSince(matchTime ?? null);
                const dataUnavailable = isLive && !hasAgents && elapsed !== null && elapsed > 20;
                if (dataUnavailable) return null; // 上のバナーで案内済み
                if (isLive && !hasAgents) return 'ウォームアップ中 — 開始するとエージェント構成が表示されます（15秒ごとに自動更新）';
                if (isLive) return '15秒ごとに自動更新 ・ エージェント構成はマップ進行で変化します';
                return '予想ロスター（試合開始でエージェントが表示されます）';
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
