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
