-- Supabase Realtime を match_scores テーブルで有効化
ALTER PUBLICATION supabase_realtime ADD TABLE match_scores;

-- 匿名ユーザーの読み取りを許可（ブラウザから直接 Supabase へアクセスするため）
ALTER TABLE match_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON match_scores   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON match_schedule FOR SELECT TO anon USING (true);

-- Web Push サブスクリプション管理テーブル
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint   TEXT        UNIQUE NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert" ON push_subscriptions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_delete" ON push_subscriptions FOR DELETE TO anon USING (true);
