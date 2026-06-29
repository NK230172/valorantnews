// サービスワーカーが push 受信時に叩くエンドポイント
// ライブ中の試合スコアを返す

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET() {
  const { data } = await supabase
    .from('match_scores')
    .select('match_id, team1_name, team2_name, team1_score, team2_score')
    .eq('status', 'live');

  return NextResponse.json(
    { matches: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
