-- ==============================================
-- マイグレーション v3: 売上=予算モデル＋原価6項目／販管費2項目への再構成
--
-- 変更点:
--   ① revenue を campaigns.budget で集計（旧: billing_amount を使用、billing_amount = budget × (1-margins) で保存していた）
--   ② billing_amount の意味を「予算そのもの」に変更
--      → 既存レコードを `billing_amount = budget` に一括 UPDATE する
--   ③ 営業代理店フィー（小売マージン＋代理店マージン）を agency_fee_cost として算出し販管費に計上
--   ④ campaign_costs に新 cost_type 'review_cost' / 'product_cost' / 'misc' を加え、原価集計に使う
--      （DB は cost_type TEXT のため enum 制約変更不要）
--   ⑤ MonthlyPL.cogs_total / sga_total / operating_profit を view 側で算出
--
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- ① 既存 view を DROP（CREATE OR REPLACE では列名変更ができないため）
DROP VIEW IF EXISTS monthly_revenue_detail;
DROP VIEW IF EXISTS monthly_pl_view;

-- ② billing_amount の値を budget に揃える
--    旧定義: billing_amount = budget × (1 - retail_margin - agency_margin)
--    新定義: billing_amount = budget （予算そのもの）
--    ※ 売上として budget を直接使う view 定義に切り替えるため、データも揃える。
--    ※ 「実請求額」として旧定義の値が必要な案件は、後日 actual_invoice_amount カラムを別途追加して保持する想定。
UPDATE campaigns
SET billing_amount = budget
WHERE budget IS NOT NULL AND budget > 0;

-- ③ monthly_pl_view 再作成
CREATE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  -- 売上 = budget（予算そのもの）。view_complete の月で按分
  SELECT DATE_TRUNC('month', view_complete)::date AS month,
         SUM(budget) AS total_revenue
  FROM campaigns
  WHERE budget IS NOT NULL AND budget > 0 AND view_complete IS NOT NULL
  GROUP BY DATE_TRUNC('month', view_complete)::date
),
agency_fee AS (
  -- 営業代理店フィー = budget × (retail_margin + agency_margin)
  -- retail_margin / agency_margin は NUMERIC(5,4)（0.40 等）で保存されているので 100 で割らない
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
product_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs WHERE cost_type = 'product_cost'
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
  -- 原価6項目
  COALESCE(rc.total, 0) AS review_cost,
  COALESCE(ur.total, 0) AS user_reward_cost,
  COALESCE(pc.total, 0) AS product_cost,
  COALESCE(sc.total, 0) AS subcontract_cost,
  COALESCE(ad.total, 0) AS ad_delivery_cost,
  COALESCE(mc.total, 0) AS misc_cost,
  -- 販管費2項目
  COALESCE(af.total, 0) AS agency_fee_cost,
  COALESCE(p.total, 0) AS personnel_cost,
  -- 補足（メイン集計外）
  COALESCE(eg.total, 0) AS e_guardian_cost,
  -- 集計
  COALESCE(rc.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0) AS cogs_total,
  COALESCE(af.total,0) + COALESCE(p.total,0) AS sga_total,
  COALESCE(rc.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0)
    + COALESCE(af.total,0) + COALESCE(p.total,0) AS total_cost,
  COALESCE(r.total_revenue, 0)
    - (COALESCE(rc.total,0) + COALESCE(ur.total,0) + COALESCE(pc.total,0) + COALESCE(sc.total,0) + COALESCE(ad.total,0) + COALESCE(mc.total,0))
    - (COALESCE(af.total,0) + COALESCE(p.total,0)) AS operating_profit
FROM months m
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN agency_fee af ON af.month = m.month
LEFT JOIN e_guardian eg ON eg.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN user_reward ur ON ur.month = m.month
LEFT JOIN subcontract sc ON sc.month = m.month
LEFT JOIN ad_delivery ad ON ad.month = m.month
LEFT JOIN product_cost pc ON pc.month = m.month
LEFT JOIN review_cost rc ON rc.month = m.month
LEFT JOIN misc_cost mc ON mc.month = m.month
ORDER BY m.month;

-- ④ monthly_revenue_detail 再作成（billing_amount を返すが、上記 ② で値が budget に揃っている）
CREATE VIEW monthly_revenue_detail AS
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

-- ⑤ PostgREST にスキーマ再読み込みを通知
NOTIFY pgrst, 'reload schema';

-- ==============================================
-- バックフィル（任意）:
--   既存案件には review_cost / product_cost / misc の campaign_costs 行がまだ無い。
--   フロントの「保存」を 1 回押すと §7-5 同期で自動 upsert される。
--   全案件を一括で同期したい場合は、運用面で「全件再保存」操作を行うか、
--   後日バックフィル SQL（targetPosts を再現する関数）を別途流す。
-- ==============================================
