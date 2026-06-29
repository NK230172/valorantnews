import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 遅延初期化: モジュール読み込み時ではなく、実際に使われた時にクライアントを生成する。
// これにより、環境変数が無い静的プリレンダリング（/_not-found 等）でビルドが落ちない。
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase の環境変数 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) が設定されていません');
  }
  _client = createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } });
  return _client;
}

// `import { supabase }` の呼び出し側を変えずに遅延初期化するための Proxy。
// プロパティアクセス（supabase.from / supabase.channel 等）の瞬間に初めて生成される。
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
