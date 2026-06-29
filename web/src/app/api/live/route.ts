// サービスワーカーが push 受信時に叩くエンドポイント
// ライブ中の試合スコアを返す

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 環境変数が無い場合でもビルド・起動を壊さない
  if (!url || !key) {
    return NextResponse.json(
      { matches: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('match_scores')
      .select('match_id, team1_name, team2_name, team1_score, team2_score')
      .eq('status', 'live');

    return NextResponse.json(
      { matches: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { matches: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
