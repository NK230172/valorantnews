'use client';

import { useState } from 'react';
import { Match, flagEmoji, LiveScore } from '@/lib/api';
import MatchDetailModal from './MatchDetailModal';

interface Props {
  match: Match;
  isWatched: boolean;
  liveOverride?: LiveScore | null; // Realtimeで上書きされたスコア
  onToggle: () => void;
}

function tournamentBadge(name: string): { label: string; color: string } {
  const lower = name.toLowerCase();
  if (lower.includes('game changers') && lower.includes('japan'))
                                          return { label: 'VGCJ', color: '#FF4655' };
  if (lower.includes('japan'))            return { label: 'VCJ', color: '#FF4655' };
  if (lower.includes('game changers'))    return { label: 'VGC', color: '#C792EA' };
  if (lower.includes('challengers'))      return { label: 'VCL', color: '#8B95A1' };
  if (lower.includes('world cup'))        return { label: 'EWC', color: '#4FC3F7' };
  if (lower.includes('vct') || lower.includes('champions tour'))
                                          return { label: 'VCT', color: '#FF4655' };
  if (lower.includes('esports nations'))  return { label: 'ENC', color: '#4FC3F7' };
  return { label: name.slice(0, 6).toUpperCase(), color: '#8B95A1' };
}

export default function MatchRow({ match, isWatched, liveOverride, onToggle }: Props) {
  const live   = liveOverride ?? match.liveScore;
  const isLive = match.status === 'live';
  const badge  = tournamentBadge(match.tournament ?? match.eventName ?? '');
  const [showDetail, setShowDetail] = useState(false);

  const score1 = live?.team1_score ?? 0;
  const score2 = live?.team2_score ?? 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-val-card border-b border-val-border">
      {/* クリックで詳細（ロスター/エージェント構成）を開く領域 */}
      <button
        onClick={() => setShowDetail(true)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-val-bg/30 -my-1 py-1 rounded transition-colors"
        aria-label="試合詳細を表示"
      >
        {/* 大会バッジ */}
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ color: badge.color, border: `1px solid ${badge.color}` }}
        >
          {badge.label}
        </span>

        {/* チーム1 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{flagEmoji(match.team1Flag)}</span>
            <span className="text-sm font-semibold text-val-text truncate">{match.team1Name}</span>
          </div>
        </div>

        {/* スコア or 状態 */}
        <div className="flex flex-col items-center shrink-0 min-w-[56px]">
          {isLive ? (
            <>
              <div className="flex items-center gap-2 font-bold text-lg text-val-text tabular-nums">
                <span>{score1}</span>
                <span className="text-val-muted text-xs">-</span>
                <span>{score2}</span>
              </div>
              <span className="text-[9px] font-bold text-val-red animate-pulse">LIVE</span>
            </>
          ) : match.status === 'upcoming' ? (
            <span className="text-xs text-val-muted">予定</span>
          ) : (
            <div className="flex items-center gap-2 font-bold text-lg text-val-muted tabular-nums">
              <span>{score1}</span>
              <span className="text-val-muted text-xs">-</span>
              <span>{score2}</span>
            </div>
          )}
        </div>

        {/* チーム2 */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-sm font-semibold text-val-text truncate">{match.team2Name}</span>
            <span className="text-base">{flagEmoji(match.team2Flag)}</span>
          </div>
        </div>
      </button>

      {/* ★ ウォッチボタン */}
      <button
        onClick={onToggle}
        className="shrink-0 text-xl leading-none transition-colors"
        style={{ color: isWatched ? '#FF4655' : '#2A3A4A' }}
        aria-label={isWatched ? 'ウォッチを解除' : 'ウォッチに追加'}
      >
        ★
      </button>

      {showDetail && (
        <MatchDetailModal
          matchId={match.matchId}
          team1Name={match.team1Name}
          team2Name={match.team2Name}
          team1Flag={match.team1Flag}
          team2Flag={match.team2Flag}
          isLive={isLive}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}
