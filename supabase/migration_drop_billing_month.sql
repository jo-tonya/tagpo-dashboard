-- ==============================================
-- マイグレーション:
--   ① campaigns.billing_month カラム廃止 → view_complete（再生完了月）から請求月を算出
--   ② campaign_subcontracts.delegated_budget カラム削除（運用上未使用）
--   ③ monthly_pl_view を case-by-case 集計（user_reward / subcontract / ad_delivery）に再構成
-- 実行順:
--   1. 依存 view を DROP
--   2. campaigns.billing_month / campaign_subcontracts.delegated_budget を削除
--   3. view を再作成
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- 1. 依存 view を落とす
DROP VIEW IF EXISTS monthly_revenue_detail;
DROP VIEW IF EXISTS monthly_pl_view;

-- 2-a. campaigns.billing_month カラム削除
ALTER TABLE campaigns DROP COLUMN IF EXISTS billing_month;

-- 2-b. campaign_subcontracts.delegated_budget カラム削除（view 依存なし）
ALTER TABLE campaign_subcontracts DROP COLUMN IF EXISTS delegated_budget;

-- 3-a. monthly_pl_view 再作成
--      コストを 5 区分に分解して返す:
--        e_guardian_cost  : fixed_costs(cost_category='e_guardian')
--        personnel_cost   : personnel_payments
--        user_reward_cost : campaign_costs(cost_type='tonya_user_payment')
--        subcontract_cost : campaign_costs(cost_type IN subcontract_1..3)
--        ad_delivery_cost : campaign_costs(cost_type='ad_delivery')
CREATE OR REPLACE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  SELECT DATE_TRUNC('month', view_complete)::date AS month,
         SUM(billing_amount) AS total_revenue
  FROM campaigns
  WHERE billing_amount IS NOT NULL AND billing_amount > 0 AND view_complete IS NOT NULL
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
user_reward AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type = 'tonya_user_payment'
  GROUP BY target_month
),
subcontract AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type IN ('subcontract_1','subcontract_2','subcontract_3')
  GROUP BY target_month
),
ad_delivery AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type = 'ad_delivery'
  GROUP BY target_month
)
SELECT
  m.month,
  COALESCE(r.total_revenue, 0) AS revenue,
  COALESCE(eg.total, 0) AS e_guardian_cost,
  COALESCE(p.total, 0) AS personnel_cost,
  COALESCE(ur.total, 0) AS user_reward_cost,
  COALESCE(sc.total, 0) AS subcontract_cost,
  COALESCE(ad.total, 0) AS ad_delivery_cost,
  COALESCE(eg.total, 0) + COALESCE(p.total, 0) + COALESCE(ur.total, 0) + COALESCE(sc.total, 0) + COALESCE(ad.total, 0) AS total_cost,
  COALESCE(r.total_revenue, 0) - (COALESCE(eg.total, 0) + COALESCE(p.total, 0) + COALESCE(ur.total, 0) + COALESCE(sc.total, 0) + COALESCE(ad.total, 0)) AS operating_profit
FROM months m
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN e_guardian eg ON eg.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN user_reward ur ON ur.month = m.month
LEFT JOIN subcontract sc ON sc.month = m.month
LEFT JOIN ad_delivery ad ON ad.month = m.month
ORDER BY m.month;

-- 3-b. monthly_revenue_detail 再作成（view_complete ベース）
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
