-- ==============================================
-- マイグレーション v8: 外注先ごとの請求月（campaign_subcontracts.billing_month）
--
-- 改修⑯: 1 案件あたり最大 3 社の外注先それぞれに、独立した請求月を持たせる。
--   保存時にこの billing_month が campaign_costs.target_month へ伝播し、
--   ダッシュボード PL の月別集計・/payments・/costs にそのまま反映される。
--
-- 注意: 実行前に Supabase の pg_dump バックアップを取得すること。
-- ==============================================

-- ① campaign_subcontracts に billing_month カラム追加
ALTER TABLE campaign_subcontracts
  ADD COLUMN IF NOT EXISTS billing_month DATE;

-- ② 既存レコードの初期値: 親案件の view_complete の月初に揃える
UPDATE campaign_subcontracts cs
SET billing_month = DATE_TRUNC('month', c.view_complete)::date
FROM campaigns c
WHERE cs.campaign_id = c.id
  AND cs.billing_month IS NULL
  AND c.view_complete IS NOT NULL;

-- ③ インデックス（月絞り込み用）
CREATE INDEX IF NOT EXISTS idx_campaign_subcontracts_billing_month
  ON campaign_subcontracts(billing_month);

-- ④ PostgREST スキーマキャッシュ再読み込み
NOTIFY pgrst, 'reload schema';

-- ==============================================
-- 確認:
--   SELECT id, company_name, billing_month FROM campaign_subcontracts
--   ORDER BY billing_month NULLS LAST LIMIT 10;
-- ==============================================
