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

-- RLS: 既存運用に揃え、現時点では DISABLE する。
--   理由: 本システムは src/middleware.ts で「v3: 認証なしで統合を完了させる」運用に
--   なっており、Supabase へのリクエストは全て anon role で飛ぶ。既存テーブル
--   (campaigns / campaign_costs / fixed_costs / personnel_payments 等) も
--   relrowsecurity = false の状態で稼働している（schema.sql の DO $$ ループは
--   実際には本番に適用されていない）。
--   monthly_budgets だけ RLS を ENABLE するとここだけ書き込みが弾かれるため、
--   既存方針に揃える。
--   将来 middleware で認証を有効化したタイミングで、全テーブルに対して一斉に
--   RLS を ENABLE + auth_full_access ポリシーを貼る別マイグレーションを追加する。
ALTER TABLE monthly_budgets DISABLE ROW LEVEL SECURITY;
