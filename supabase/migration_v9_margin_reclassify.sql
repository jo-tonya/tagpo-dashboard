-- ==============================================
-- マイグレーション v9: マージン分類の修正＋PL 構造の再設計（改修⑰）
--
-- 背景:
--   改修⑮(v7) で agency_fee を販管費(sga_total) に入れていたのを撤回。
--   マージンは「Tagpo が支払う費用」ではなく「予算からクライアントが控除する分」。
--   売上構造側に独立カラムとして並べ、販管費からも原価からも除外する。
--
-- 主な変更:
--   - retail_margin_cost / agency_margin_cost / margin_total を売上構造側に追加
--   - agency_fee_cost を view から削除
--   - gross_profit カラムを追加（revenue - cogs_total）
--   - sga_total は eg_admin + personnel のみ
--   - operating_profit = revenue - cogs_total - sga_total（マージン控除済み売上ベース）
--   - monthly_revenue_detail に retail_margin_amount / agency_margin_amount を追加
--
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

DROP VIEW IF EXISTS monthly_revenue_detail;
DROP VIEW IF EXISTS monthly_pl_view;

CREATE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  -- 売上（billing_amount）と予算（budget）、マージン（売上控除分）を返す
  SELECT DATE_TRUNC('month', view_complete)::date AS month,
         SUM(billing_amount) AS total_revenue,
         SUM(budget)         AS total_budget,
         SUM(budget * COALESCE(retail_margin, 0))  AS total_retail_margin,
         SUM(budget * COALESCE(agency_margin, 0))  AS total_agency_margin
  FROM campaigns
  WHERE billing_amount IS NOT NULL AND view_complete IS NOT NULL
  GROUP BY DATE_TRUNC('month', view_complete)::date
),
eg_review AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM fixed_costs
  WHERE cost_category = 'e_guardian' AND cost_subcategory = '審査（実費入力）'
  GROUP BY target_month
),
eg_admin AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM fixed_costs
  WHERE cost_category = 'e_guardian' AND cost_subcategory = '管理費'
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
),
product_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type = 'product_cost'
  GROUP BY target_month
),
misc_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type = 'misc'
  GROUP BY target_month
)
SELECT
  m.month,
  -- ── 売上構造 ──
  COALESCE(r.total_budget,         0) AS budget,
  COALESCE(r.total_retail_margin,  0) AS retail_margin_cost,
  COALESCE(r.total_agency_margin,  0) AS agency_margin_cost,
  COALESCE(r.total_retail_margin,  0) + COALESCE(r.total_agency_margin, 0) AS margin_total,
  COALESCE(r.total_revenue,        0) AS revenue,
  -- ── 原価 6 項目（マージン含まず）──
  COALESCE(eg_r.total, 0) AS review_cost,
  COALESCE(ur.total,   0) AS user_reward_cost,
  COALESCE(pc.total,   0) AS product_cost,
  COALESCE(sc.total,   0) AS subcontract_cost,
  COALESCE(ad.total,   0) AS ad_delivery_cost,
  COALESCE(mc.total,   0) AS misc_cost,
  COALESCE(eg_r.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0)
    + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0) AS cogs_total,
  -- ── 販管費 2 項目（マージン含まず）──
  COALESCE(eg_a.total, 0) AS eg_admin_cost,
  COALESCE(p.total,    0) AS personnel_cost,
  COALESCE(eg_a.total,0) + COALESCE(p.total,0) AS sga_total,
  -- ── 集計 ──
  COALESCE(r.total_revenue,0) - (
    COALESCE(eg_r.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0)
    + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0)
  ) AS gross_profit,
  COALESCE(r.total_revenue,0) - (
    COALESCE(eg_r.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0)
    + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0)
  ) - (COALESCE(eg_a.total,0) + COALESCE(p.total,0)) AS operating_profit,
  -- 互換: 旧 e_guardian_cost / total_cost も残す
  COALESCE(eg_r.total, 0) + COALESCE(eg_a.total, 0) AS e_guardian_cost,
  COALESCE(eg_r.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0)
    + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0)
    + COALESCE(eg_a.total,0) + COALESCE(p.total,0) AS total_cost
FROM months m
LEFT JOIN revenue r       ON r.month   = m.month
LEFT JOIN eg_review eg_r  ON eg_r.month = m.month
LEFT JOIN eg_admin  eg_a  ON eg_a.month = m.month
LEFT JOIN personnel p     ON p.month   = m.month
LEFT JOIN user_reward ur  ON ur.month  = m.month
LEFT JOIN subcontract sc  ON sc.month  = m.month
LEFT JOIN ad_delivery ad  ON ad.month  = m.month
LEFT JOIN product_cost pc ON pc.month  = m.month
LEFT JOIN misc_cost mc    ON mc.month  = m.month
ORDER BY m.month;

CREATE VIEW monthly_revenue_detail AS
SELECT
  DATE_TRUNC('month', view_complete)::date AS month,
  id AS campaign_id,
  COALESCE(project_number, '') || maker || ' ' || product AS display_name,
  budget,
  billing_amount,
  ROUND(budget * COALESCE(retail_margin, 0)) AS retail_margin_amount,
  ROUND(budget * COALESCE(agency_margin, 0)) AS agency_margin_amount,
  status,
  certainty
FROM campaigns
WHERE billing_amount IS NOT NULL AND view_complete IS NOT NULL
ORDER BY DATE_TRUNC('month', view_complete)::date, id;

NOTIFY pgrst, 'reload schema';

-- ==============================================
-- 確認:
--   SELECT month, budget, retail_margin_cost, agency_margin_cost, margin_total, revenue,
--          cogs_total, sga_total, gross_profit, operating_profit
--   FROM monthly_pl_view ORDER BY month LIMIT 6;
-- ==============================================
