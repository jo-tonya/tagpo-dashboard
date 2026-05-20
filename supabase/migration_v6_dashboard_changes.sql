-- ==============================================
-- マイグレーション v6: 改修⑫ 一括
--
-- 内容:
--   §12-1: campaigns.product_unit_price カラム復活
--   §12-3: campaigns.certainty を 5 値（A.完了 / B.進行中 / C.受注確定 / D.見込み+ / E.見込み-）に移行
--   §12-4: campaigns.creative_notes / schedule_notes カラム追加
--   §12-5: monthly_pl_view の review_cost を「審査（実費入力）」のみに戻し、eg_admin_cost を販管費の独立カラムとして復活。
--          §12-1 方針B として product_cost 行を view に追加
--
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- ① §12-1: 商品単価カラム復活
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS product_unit_price NUMERIC(10,0);

-- ② §12-4: クリエイティブ追加指示 / スケジュール注意点 カラム追加
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS creative_notes TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_notes TEXT;

-- ③ §12-3: 既存 certainty 値を 5 値に移行
UPDATE campaigns SET certainty = 'A.完了'    WHERE certainty = '確定';
UPDATE campaigns SET certainty = 'B.進行中'  WHERE certainty = '見込み';
UPDATE campaigns SET certainty = 'D.見込み+' WHERE certainty = '未確定';

-- ④ §12-5: monthly_pl_view 再作成
--   review_cost   = fixed_costs (e_guardian / 審査（実費入力））のみ
--   eg_admin_cost = fixed_costs (e_guardian / 管理費）
--   product_cost  = campaign_costs (product_cost) を CTE 復活
DROP VIEW IF EXISTS monthly_revenue_detail;
DROP VIEW IF EXISTS monthly_pl_view;

CREATE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  SELECT DATE_TRUNC('month', view_complete)::date AS month,
         SUM(budget) AS total_revenue
  FROM campaigns
  WHERE budget IS NOT NULL AND budget > 0 AND view_complete IS NOT NULL
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
  -- 原価6項目
  COALESCE(eg_r.total, 0) AS review_cost,
  COALESCE(ur.total, 0) AS user_reward_cost,
  COALESCE(pc.total, 0) AS product_cost,
  COALESCE(sc.total, 0) AS subcontract_cost,
  COALESCE(ad.total, 0) AS ad_delivery_cost,
  COALESCE(mc.total, 0) AS misc_cost,
  -- 販管費3項目
  COALESCE(eg_a.total, 0) AS eg_admin_cost,
  COALESCE(af.total, 0) AS agency_fee_cost,
  COALESCE(p.total, 0) AS personnel_cost,
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
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN agency_fee af ON af.month = m.month
LEFT JOIN eg_review eg_r ON eg_r.month = m.month
LEFT JOIN eg_admin eg_a ON eg_a.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN user_reward ur ON ur.month = m.month
LEFT JOIN subcontract sc ON sc.month = m.month
LEFT JOIN ad_delivery ad ON ad.month = m.month
LEFT JOIN product_cost pc ON pc.month = m.month
LEFT JOIN misc_cost mc ON mc.month = m.month
ORDER BY m.month;

CREATE VIEW monthly_revenue_detail AS
SELECT
  DATE_TRUNC('month', view_complete)::date AS month,
  id AS campaign_id,
  COALESCE(project_number, '') || maker || ' ' || product AS display_name,
  budget AS billing_amount,
  status,
  certainty
FROM campaigns
WHERE budget IS NOT NULL AND budget > 0 AND view_complete IS NOT NULL
ORDER BY DATE_TRUNC('month', view_complete)::date, id;

-- ⑤ PostgREST スキーマキャッシュ再読み込み
NOTIFY pgrst, 'reload schema';

-- ==============================================
-- 確認:
--   SELECT certainty, COUNT(*) FROM campaigns GROUP BY certainty;
--   SELECT month, review_cost, eg_admin_cost, product_cost FROM monthly_pl_view ORDER BY month;
-- ==============================================
