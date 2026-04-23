-- ==============================================
-- Tagpo統合版 v3 — DB スキーマ変更
-- 既存の campaigns, milestone_checks テーブルは変更なし
-- ==============================================

-- campaigns テーブルにPL連携用カラムを追加
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS project_number TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS billing_month DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS billing_amount NUMERIC(12,0);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS invoice_receive_month DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS retail_margin NUMERIC(5,4) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS agency_margin NUMERIC(5,4) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS product_unit_price NUMERIC(10,0);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS review_unit_price NUMERIC(10,0);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_reward_unit_price NUMERIC(10,4);

-- 外注管理（最大3社/案件）
CREATE TABLE IF NOT EXISTS campaign_subcontracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  company_name TEXT NOT NULL,
  delegated_amount NUMERIC(12,0) DEFAULT 0,
  delegated_budget NUMERIC(12,0) DEFAULT 0,
  delegated_revenue NUMERIC(12,0) DEFAULT 0,
  notes TEXT,
  UNIQUE(campaign_id, sort_order),
  CHECK (sort_order BETWEEN 1 AND 3)
);

-- 案件コスト明細（月次）
CREATE TABLE IF NOT EXISTS campaign_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL,
  cost_label TEXT NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  target_month DATE,
  UNIQUE(campaign_id, cost_type, target_month)
);

-- 固定費（イー・ガーディアン等）
CREATE TABLE IF NOT EXISTS fixed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_category TEXT NOT NULL,
  cost_subcategory TEXT NOT NULL,
  target_month DATE NOT NULL,
  amount NUMERIC(12,0) DEFAULT 0,
  quantity INTEGER,
  unit_price NUMERIC(10,0),
  status TEXT DEFAULT '見込み',
  note TEXT,
  UNIQUE(cost_category, cost_subcategory, target_month)
);

-- 人件費マスタ
CREATE TABLE IF NOT EXISTS personnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 人件費明細（月次）
CREATE TABLE IF NOT EXISTS personnel_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID REFERENCES personnel(id) ON DELETE CASCADE,
  target_month DATE NOT NULL,
  amount NUMERIC(12,0) DEFAULT 0,
  payment_type TEXT NOT NULL,
  quantity INTEGER,
  unit_price NUMERIC(10,0),
  status TEXT DEFAULT '見込み',
  UNIQUE(personnel_id, target_month, payment_type)
);

-- インフルエンサーマスタ
CREATE TABLE IF NOT EXISTS influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT,
  username TEXT NOT NULL,
  registered_at TIMESTAMPTZ,
  respondent_name TEXT,
  line_id TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  account_type TEXT,
  account_number TEXT,
  account_holder TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インフルエンサー支払い
CREATE TABLE IF NOT EXISTS influencer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  target_month DATE NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  transfer_status TEXT DEFAULT '未実行',
  UNIQUE(influencer_id, target_month)
);

-- 請求書管理
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  target_month DATE NOT NULL,
  sent_date DATE,
  invoice_file_name TEXT,
  total_amount_tax_included NUMERIC(12,0),
  note TEXT,
  payment_status TEXT DEFAULT '未払い',
  campaign_id INTEGER REFERENCES campaigns(id),
  UNIQUE(direction, counterparty, target_month)
);

-- ==============================================
-- ビュー（PL集計用）
-- ==============================================

-- 月次PLサマリー
CREATE OR REPLACE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  SELECT billing_month AS month, SUM(billing_amount) AS total_revenue
  FROM campaigns WHERE billing_amount IS NOT NULL
  GROUP BY billing_month
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
campaign_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM campaign_costs
  GROUP BY target_month
)
SELECT
  m.month,
  COALESCE(r.total_revenue, 0) AS revenue,
  COALESCE(eg.total, 0) AS e_guardian_cost,
  COALESCE(p.total, 0) AS personnel_cost,
  COALESCE(cc.total, 0) AS project_cost,
  COALESCE(eg.total, 0) + COALESCE(p.total, 0) + COALESCE(cc.total, 0) AS total_cost,
  COALESCE(r.total_revenue, 0) - COALESCE(eg.total, 0) - COALESCE(p.total, 0) - COALESCE(cc.total, 0) AS operating_profit
FROM months m
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN e_guardian eg ON eg.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN campaign_cost cc ON cc.month = m.month
ORDER BY m.month;

-- 案件別 月次売上（ダッシュボード展開用）
CREATE OR REPLACE VIEW monthly_revenue_detail AS
SELECT
  billing_month AS month,
  id AS campaign_id,
  COALESCE(project_number, '') || maker || ' ' || product AS display_name,
  billing_amount,
  status
FROM campaigns
WHERE billing_amount IS NOT NULL AND billing_amount > 0
ORDER BY billing_month, id;

-- 案件別 月次コスト（ダッシュボード展開用）
CREATE OR REPLACE VIEW monthly_cost_detail AS
SELECT
  cc.target_month AS month,
  c.id AS campaign_id,
  COALESCE(c.project_number, '') || c.maker || ' ' || c.product AS display_name,
  cc.cost_type,
  cc.cost_label,
  cc.amount
FROM campaign_costs cc
JOIN campaigns c ON c.id = cc.campaign_id
WHERE cc.amount > 0
ORDER BY cc.target_month, c.id, cc.cost_type;
