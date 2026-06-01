-- ==============================================
-- バックフィル: 既存案件の billing_amount をマージン控除後に揃える（§17 補正）
--
-- 背景:
--   v6 では billing_amount = budget で保存されていたが、§15 (v7) で
--   billing_amount を独立化、§17 (v9) で「売上 = 予算 − マージン」に意味変更。
--   v6 当時に作成された既存案件は billing_amount = budget のままで、
--   月次PL の「案件売上」が「案件予算」と同値になってしまう。
--
-- 対応:
--   billing_amount が currently = budget で、かつマージンが 1 つでも設定されている
--   案件だけを対象に、マージン控除後の値で UPDATE する。
--   手動で billing_amount を上書き済みの案件（billing_amount ≠ budget）には触れない。
-- ==============================================

UPDATE campaigns
SET billing_amount = ROUND(budget * (1 - COALESCE(retail_margin, 0) - COALESCE(agency_margin, 0)))
WHERE billing_amount = budget
  AND budget IS NOT NULL AND budget > 0
  AND (COALESCE(retail_margin, 0) > 0 OR COALESCE(agency_margin, 0) > 0);

-- 確認: 全案件で「予算 − マージン合計 ≒ 売上」になっているか
SELECT id, maker, product, budget, billing_amount,
       ROUND(budget * COALESCE(retail_margin, 0)) AS retail_margin_amount,
       ROUND(budget * COALESCE(agency_margin, 0)) AS agency_margin_amount,
       budget - billing_amount AS diff_from_budget
FROM campaigns
WHERE budget IS NOT NULL AND budget > 0
ORDER BY id;
