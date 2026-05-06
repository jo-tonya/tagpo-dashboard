-- ==============================================
-- バックフィル: 既存案件の review_cost / product_cost を campaign_costs に一括 upsert
--
-- 計算式:
--   targetPosts    = CEIL( (budget / unit_price) / avg_views )    -- = 目標投稿数 Y
--   review_cost    = targetPosts × COALESCE(review_unit_price, 1000)   -- 審査費（投稿人数×1000円）
--   product_cost   = targetPosts × COALESCE(product_unit_price, 0)     -- 商品代
--   target_month   = DATE_TRUNC('month', view_complete)::date
--
-- misc は手入力のため対象外（既存値を保持）。
-- 既に campaign_costs 行が存在する campaign_id × cost_type は DELETE → INSERT で上書き。
--
-- 実行前提: migration_pl_view_v3.sql を先に実行して view を新スキーマにしておくこと。
-- ==============================================

-- ① 既存の review_cost / product_cost 行を一旦削除（クリーンに上書きするため）
DELETE FROM campaign_costs WHERE cost_type IN ('review_cost', 'product_cost');

-- ② review_cost を一括 INSERT
INSERT INTO campaign_costs (campaign_id, cost_type, cost_label, amount, target_month)
SELECT
  c.id,
  'review_cost',
  '審査費',
  CEIL((c.budget::numeric / c.unit_price) / c.avg_views) * COALESCE(c.review_unit_price, 1000),
  DATE_TRUNC('month', c.view_complete)::date
FROM campaigns c
WHERE c.budget IS NOT NULL AND c.budget > 0
  AND c.unit_price IS NOT NULL AND c.unit_price > 0
  AND c.avg_views IS NOT NULL AND c.avg_views > 0
  AND c.view_complete IS NOT NULL;

-- ③ product_cost を一括 INSERT（product_unit_price > 0 のものだけ）
INSERT INTO campaign_costs (campaign_id, cost_type, cost_label, amount, target_month)
SELECT
  c.id,
  'product_cost',
  '商品代',
  CEIL((c.budget::numeric / c.unit_price) / c.avg_views) * c.product_unit_price,
  DATE_TRUNC('month', c.view_complete)::date
FROM campaigns c
WHERE c.budget IS NOT NULL AND c.budget > 0
  AND c.unit_price IS NOT NULL AND c.unit_price > 0
  AND c.avg_views IS NOT NULL AND c.avg_views > 0
  AND c.product_unit_price IS NOT NULL AND c.product_unit_price > 0
  AND c.view_complete IS NOT NULL;

-- ④ PostgREST にスキーマキャッシュ再読み込みを通知
NOTIFY pgrst, 'reload schema';

-- ==============================================
-- 確認クエリ:
--   SELECT cost_type, COUNT(*), SUM(amount)
--   FROM campaign_costs
--   GROUP BY cost_type
--   ORDER BY cost_type;
-- ==============================================
