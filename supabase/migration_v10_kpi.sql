-- 改修㉔: 目標・KPI タブ
-- ダッシュボード最上部に置く KPI 管理ブロックの手入力データを保持する。
--   - 売上系 KPI の「現時点の数値（実績）」は campaigns から動的算出（テーブル不要）
--   - 「目標数値」と、ユーザー系 KPI の「現時点の数値」は手入力 → kpi_manual_values
--   - 月ごとの重要アクション（チェックリスト） → kpi_actions
--
-- RLS は既存テーブル方針（monthly_budgets 等）に揃えて DISABLE（社内利用・認証なし前提）。

-- 1) 手入力値（目標／ユーザー系実績）
CREATE TABLE IF NOT EXISTS kpi_manual_values (
  month        DATE    NOT NULL,
  metric_key   TEXT    NOT NULL,            -- adinte_revenue / user_count 等
  kind         TEXT    NOT NULL DEFAULT 'target',  -- 'target'（目標） | 'actual'（ユーザー系の手入力実績）
  value        NUMERIC(16,4) DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (month, metric_key, kind)
);
ALTER TABLE kpi_manual_values DISABLE ROW LEVEL SECURITY;

-- 2) 月ごとの重要アクション（チェックリスト）
CREATE TABLE IF NOT EXISTS kpi_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month       DATE    NOT NULL,            -- 'YYYY-MM-01'
  text        TEXT    NOT NULL DEFAULT '',
  checked     BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE kpi_actions DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_kpi_actions_month ON kpi_actions(month);

-- 参考: 入金管理（receivables）は改修㉔で廃止。テーブルを物理削除する場合は以下を実行（既存データ消失）。
-- DROP TABLE IF EXISTS receivables;
