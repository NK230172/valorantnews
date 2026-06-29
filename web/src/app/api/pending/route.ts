// サービスワーカーが push 受信時に叩く: 自分(endpoint)宛の保留通知を取得して消す。
// SECURITY DEFINER の RPC pop_pending を anon キーで呼ぶ（自分のendpoint分だけ取得・削除）。
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const endpoint = new URL(req.url).searchParams.get('endpoint');

  if (!url || !key || !endpoint) {
    return NextResponse.json({ messages: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const supabase = createClient(url, key);
    const { data } = await supabase.rpc('pop_pending', { p_endpoint: endpoint });
    return NextResponse.json(
      { messages: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ messages: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
