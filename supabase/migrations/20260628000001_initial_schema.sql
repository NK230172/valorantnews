-- ======================================================
-- VALORANT Match Tracker – 初期スキーマ
-- ======================================================

-- デバイストークン管理
CREATE TABLE IF NOT EXISTS device_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token  TEXT        UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ウォッチリスト（デバイスが監視する試合）
CREATE TABLE IF NOT EXISTS watchlist (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token_id UUID  NOT NULL REFERENCES device_tokens(id) ON DELETE CASCADE,
  match_id        TEXT  NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_token_id, match_id)
);

-- ライブスコアキャッシュ（前回値と比較して変化を検知）
CREATE TABLE IF NOT EXISTS match_scores (
  match_id     TEXT        PRIMARY KEY,
  tournament   TEXT        NOT NULL,
  team1_name   TEXT        NOT NULL,
  team2_name   TEXT        NOT NULL,
  team1_score  INTEGER     NOT NULL DEFAULT 0,
  team2_score  INTEGER     NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'upcoming', -- upcoming | live | completed
  round_info   TEXT,
  map_scores   JSONB       NOT NULL DEFAULT '[]',
  match_time   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- スケジュールキャッシュ
CREATE TABLE IF NOT EXISTS match_schedule (
  match_id     TEXT        PRIMARY KEY,
  tournament   TEXT        NOT NULL,
  event_name   TEXT        NOT NULL,
  team1_name   TEXT        NOT NULL,
  team2_name   TEXT        NOT NULL,
  team1_flag   TEXT,
  team2_flag   TEXT,
  match_time   TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'upcoming',
  match_page   TEXT,
  cached_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_device_tokens_updated_at
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_match_scores_updated_at
  BEFORE UPDATE ON match_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- pg_cron: 毎分 poll-scores Edge Function を呼び出す
-- ※ YOUR_PROJECT_REF と YOUR_SERVICE_ROLE_KEY はデプロイ後に実際の値に置き換える
-- SELECT cron.schedule(
--   'poll-live-scores',
--   '* * * * *',
--   $$
--     SELECT net.http_post(
--       url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/poll-scores',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );
