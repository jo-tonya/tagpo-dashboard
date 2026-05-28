-- ==============================================
-- マイグレーション v7: 改修⑮
--   ① campaigns.billing_to       … 請求先（自由入力）
--   ② campaigns.category         … 案件種別 ENUM（Tagpo / POSCO / インフルエンサー / その他）
--   ③ monthly_pl_view に budget カラム追加（campaigns.budget の月別合計）
--   ④ monthly_revenue_detail に budget カラム追加
--
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- ① 請求先（自由入力テキスト）
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS billing_to TEXT;

-- ② 案件種別（ENUM）
DO $$ BEGIN
  CREATE TYPE campaign_category_t AS ENUM ('Tagpo','POSCO','インフルエンサー','その他');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS category campaign_category_t;

-- 既存レコードのデフォルト値を 'Tagpo' に
UPDATE campaigns SET category = 'Tagpo' WHERE category IS NULL;

-- 案件一覧の絞り込み・並べ替え高速化
CREATE INDEX IF NOT EXISTS idx_campaigns_view_complete ON campaigns(view_complete);
CREATE INDEX IF NOT EXISTS idx_campaigns_category      ON campaigns(category);

-- ③④ view 再作成（budget カラム追加）
DROP VIEW IF EXISTS monthly_revenue_detail;
DROP VIEW IF EXISTS monthly_pl_view;

CREATE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  SELECT DATE_TRUNC('month', view_complete)::date AS month,
         SUM(billing_amount) AS total_revenue,
         SUM(budget)         AS total_budget
  FROM campaigns
  WHERE billing_amount IS NOT NULL AND view_complete IS NOT NULL
  GROUP BY DATE_TRUNC('month', view_complete)::date
),
agency_fee AS (
  SELECT DATE_TRUNC('month', view_complete)::date AS month,
         SUM(budget * (COALESCE(retail_margin, 0) + COALESCE(agency_margin, 0))) AS total
  FROM campaigns
  WHERE budget IS NOT NULL AND budget > 0 AND view_complete IS NOT NULL
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
  COALESCE(r.total_revenue, 0) AS revenue,
  COALESCE(r.total_budget,  0) AS budget,
  -- 原価6項目
  COALESCE(eg_r.total, 0) AS review_cost,
  COALESCE(ur.total, 0)   AS user_reward_cost,
  COALESCE(pc.total, 0)   AS product_cost,
  COALESCE(sc.total, 0)   AS subcontract_cost,
  COALESCE(ad.total, 0)   AS ad_delivery_cost,
  COALESCE(mc.total, 0)   AS misc_cost,
  -- 販管費3項目
  COALESCE(eg_a.total, 0) AS eg_admin_cost,
  COALESCE(af.total, 0)   AS agency_fee_cost,
  COALESCE(p.total, 0)    AS personnel_cost,
  -- 補足: 互換性のため e_guardian_cost（審査費＋管理費 合計）も残す
  COALESCE(eg_r.total, 0) + COALESCE(eg_a.total, 0) AS e_guardian_cost,
  -- 集計
  COALESCE(eg_r.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0) AS cogs_total,
  COALESCE(eg_a.total,0) + COALESCE(af.total,0) + COALESCE(p.total,0) AS sga_total,
  COALESCE(eg_r.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0)
    + COALESCE(eg_a.total,0) + COALESCE(af.total,0) + COALESCE(p.total,0) AS total_cost,
  COALESCE(r.total_revenue, 0)
    - (COALESCE(eg_r.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0))
    - (COALESCE(eg_a.total,0) + COALESCE(af.total,0) + COALESCE(p.total,0)) AS operating_profit
FROM months m
LEFT JOIN revenue r       ON r.month   = m.month
LEFT JOIN agency_fee af   ON af.month  = m.month
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
  billing_amount,
  budget,
  status,
  certainty
FROM campaigns
WHERE billing_amount IS NOT NULL AND view_complete IS NOT NULL
ORDER BY DATE_TRUNC('month', view_complete)::date, id;

-- ⑤ PostgREST スキーマキャッシュ再読み込み
NOTIFY pgrst, 'reload schema';

-- ==============================================
-- 確認:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'campaigns' AND column_name IN ('billing_to', 'category');
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'monthly_pl_view' ORDER BY ordinal_position;
--   → budget が含まれていること
--
--   SELECT month, budget, revenue FROM monthly_pl_view ORDER BY month LIMIT 5;
-- ==============================================
