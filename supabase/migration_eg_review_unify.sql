-- ==============================================
-- マイグレーション v5: 審査費の二重計上排除と EG実費ベースへの一本化
--
-- 背景:
--   - 案件単位で「投稿者数 × 審査単価」を campaign_costs.review_cost に書き込んでいたが、
--     実費は EG ページ（fixed_costs.cost_category='e_guardian'）で月次入力しており二重計上していた。
--   - EG（外注先）の実費は件数単位の前月チャージ＋繰越＋管理費という独特な構造で、案件×単価では再現不可。
--
-- 変更点:
--   ① monthly_pl_view の review_cost を fixed_costs (e_guardian) の
--      「審査（実費入力）」と「管理費」を合算した値に変更
--   ② campaign_costs から cost_type='review_cost' を全削除（二重計上排除）
--   ※ campaigns.posters_count / review_unit_price カラムは残す（案件単位の試算値表示用）
--   ※ 販管費に EG管理費 を独立行として置かない（審査費と合算する運用方針）
--
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- ① campaign_costs から review_cost を全削除（二重計上排除）
DELETE FROM campaign_costs WHERE cost_type = 'review_cost';

-- ② monthly_pl_view 再作成
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
-- ★ 審査費 = EG ページの「審査（実費入力）」+「管理費」の合算
eg_total AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM fixed_costs
  WHERE cost_category = 'e_guardian'
    AND cost_subcategory IN ('審査（実費入力）', '管理費')
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
misc_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type = 'misc'
  GROUP BY target_month
)
SELECT
  m.month,
  COALESCE(r.total_revenue, 0) AS revenue,
  -- 原価5項目（審査費 = EG 審査+管理 合算）
  COALESCE(eg.total, 0) AS review_cost,
  COALESCE(ur.total, 0) AS user_reward_cost,
  COALESCE(sc.total, 0) AS subcontract_cost,
  COALESCE(ad.total, 0) AS ad_delivery_cost,
  COALESCE(mc.total, 0) AS misc_cost,
  -- 販管費2項目
  COALESCE(af.total, 0) AS agency_fee_cost,
  COALESCE(p.total, 0) AS personnel_cost,
  -- 補足: e_guardian_cost は EG 合算（review_cost と同値、互換のため残置）
  COALESCE(eg.total, 0) AS e_guardian_cost,
  -- 集計
  COALESCE(eg.total,0) + COALESCE(ur.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0) AS cogs_total,
  COALESCE(af.total,0) + COALESCE(p.total,0) AS sga_total,
  COALESCE(eg.total,0) + COALESCE(ur.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0)
    + COALESCE(af.total,0) + COALESCE(p.total,0) AS total_cost,
  COALESCE(r.total_revenue, 0)
    - (COALESCE(eg.total,0) + COALESCE(ur.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0))
    - (COALESCE(af.total,0) + COALESCE(p.total,0)) AS operating_profit
FROM months m
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN agency_fee af ON af.month = m.month
LEFT JOIN eg_total eg ON eg.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN user_reward ur ON ur.month = m.month
LEFT JOIN subcontract sc ON sc.month = m.month
LEFT JOIN ad_delivery ad ON ad.month = m.month
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

-- ③ PostgREST スキーマキャッシュ再読み込み
NOTIFY pgrst, 'reload schema';

-- ==============================================
-- 確認:
--   SELECT month, review_cost FROM monthly_pl_view ORDER BY month;
-- ==============================================
