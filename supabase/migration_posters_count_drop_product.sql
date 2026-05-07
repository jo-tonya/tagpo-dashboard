-- ==============================================
-- マイグレーション v4:
--   ① 案件テーブルに posters_count（投稿者数, 実投稿数）カラムを追加
--      → 審査費は posters_count × review_unit_price で計算する仕様に
--   ② product_unit_price カラムと product_cost コスト体系を完全削除
--   ③ monthly_pl_view を product_cost を含まない形に再作成
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- ① posters_count カラム追加
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS posters_count INTEGER;

-- ② product_unit_price カラム削除
ALTER TABLE campaigns DROP COLUMN IF EXISTS product_unit_price;

-- ③ campaign_costs から product_cost / 過去の review_cost（avg_views ベースで膨らんだ旧データ）を削除
DELETE FROM campaign_costs WHERE cost_type = 'product_cost';
-- review_cost は posters_count を埋めて再保存するまで全削除（avg_views ベースの旧データを排除）
DELETE FROM campaign_costs WHERE cost_type = 'review_cost';

-- ④ monthly_revenue_detail と monthly_pl_view を再作成（product_cost を抜く）
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
),
review_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type = 'review_cost'
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
  -- 原価5項目（商品代を除く）
  COALESCE(rc.total, 0) AS review_cost,
  COALESCE(ur.total, 0) AS user_reward_cost,
  COALESCE(sc.total, 0) AS subcontract_cost,
  COALESCE(ad.total, 0) AS ad_delivery_cost,
  COALESCE(mc.total, 0) AS misc_cost,
  -- 販管費2項目
  COALESCE(af.total, 0) AS agency_fee_cost,
  COALESCE(p.total, 0) AS personnel_cost,
  -- 補足
  COALESCE(eg.total, 0) AS e_guardian_cost,
  -- 集計
  COALESCE(rc.total,0) + COALESCE(ur.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0) AS cogs_total,
  COALESCE(af.total,0) + COALESCE(p.total,0) AS sga_total,
  COALESCE(rc.total,0) + COALESCE(ur.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0)
    + COALESCE(af.total,0) + COALESCE(p.total,0) AS total_cost,
  COALESCE(r.total_revenue, 0)
    - (COALESCE(rc.total,0) + COALESCE(ur.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0))
    - (COALESCE(af.total,0) + COALESCE(p.total,0)) AS operating_profit
FROM months m
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN agency_fee af ON af.month = m.month
LEFT JOIN e_guardian eg ON eg.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN user_reward ur ON ur.month = m.month
LEFT JOIN subcontract sc ON sc.month = m.month
LEFT JOIN ad_delivery ad ON ad.month = m.month
LEFT JOIN review_cost rc ON rc.month = m.month
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
-- 後続作業: 案件フォームから各案件を保存し直す（または fetch ループで POST）
--   posters_count を入れた案件は review_cost が campaign_costs に upsert される。
--   posters_count が空のままの案件は審査費 0 のまま（dashboard で「—」表示）。
-- ==============================================
