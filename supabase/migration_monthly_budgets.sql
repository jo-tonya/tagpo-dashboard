-- ==============================================
-- マイグレーション: 月次予算（売上予算・粗利率）テーブル新設
--   /budgets 画面で月単位で入力・upsert する。
--   ダッシュボードの「予算 vs 実績（与実）」セクションで monthly_pl_view と
--   フロントで JOIN して達成率を表示する。
-- ==============================================

CREATE TABLE IF NOT EXISTS monthly_budgets (
  month DATE PRIMARY KEY,
  revenue NUMERIC(12,0) NOT NULL DEFAULT 0,
  gross_margin_rate NUMERIC(5,4) NOT NULL DEFAULT 0,  -- 0.0000 〜 1.0000
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: 既存テーブル（campaigns, fixed_costs 等）と同じく
--   「authenticated ロールのみ全操作可」の単一ポリシーを付与する。
--   既存スキーマ schema.sql の DO $$ ループと同じパターン。
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_full_access" ON monthly_budgets;
CREATE POLICY "auth_full_access" ON monthly_budgets
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
