-- ==============================================
-- マイグレーション: campaigns.billing_month カラム廃止
--   → 請求月は view_complete（再生完了月）から算出する運用に統一
-- 実行順:
--   ① 依存 view を DROP
--   ② campaigns.billing_month カラム削除
--   ③ view を再作成（billing_month の代わりに view_complete の月初を使う）
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- ① 依存 view を落とす
DROP VIEW IF EXISTS monthly_revenue_detail;
DROP VIEW IF EXISTS monthly_pl_view;

-- ② campaigns.billing_month カラム削除
ALTER TABLE campaigns DROP COLUMN IF EXISTS billing_month;

-- ③ view を再作成
CREATE OR REPLACE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  SELECT DATE_TRUNC('month', view_complete)::date AS month,
         SUM(billing_amount) AS total_revenue
  FROM campaigns
  WHERE billing_amount IS NOT NULL
    AND billing_amount > 0
    AND view_complete IS NOT NULL
  GROUP BY DATE_TRUNC('month', view_complete)::date
),
e_guardian AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM fixed_costs WHERE cost_category = 'e_guardian'
  GROUP BY target_month
),
personnel AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM personnel_payments
  GROUP BY target_month
),
campaign_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs
  GROUP BY target_month
)
SELECT
  m.month,
  COALESCE(r.total_revenue, 0) AS revenue,
  COALESCE(eg.total, 0) AS e_guardian_cost,
  COALESCE(p.total, 0) AS personnel_cost,
  COALESCE(cc.total, 0) AS project_cost,
  COALESCE(eg.total, 0) + COALESCE(p.total, 0) + COALESCE(cc.total, 0) AS total_cost,
  COALESCE(r.total_revenue, 0) - COALESCE(eg.total, 0) - COALESCE(p.total, 0) - COALESCE(cc.total, 0) AS operating_profit
FROM months m
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN e_guardian eg ON eg.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN campaign_cost cc ON cc.month = m.month
ORDER BY m.month;

CREATE OR REPLACE VIEW monthly_revenue_detail AS
SELECT
  DATE_TRUNC('month', view_complete)::date AS month,
  id AS campaign_id,
  COALESCE(project_number, '') || maker || ' ' || product AS display_name,
  billing_amount,
  status,
  certainty
FROM campaigns
WHERE billing_amount IS NOT NULL
  AND billing_amount > 0
  AND view_complete IS NOT NULL
ORDER BY DATE_TRUNC('month', view_complete)::date, id;

-- ==============================================
-- 検出クエリ: billing_month のみ入っていて view_complete が空のレコードを確認
--   （カラム削除前に view_complete を埋める必要あり）
-- ==============================================
-- SELECT id, maker, product, billing_month, view_complete
-- FROM campaigns
-- WHERE billing_month IS NOT NULL
--   AND view_complete IS NULL;
