-- Tagpo事業管理システム — データベーススキーマ（v2）
-- Supabase SQL Editorで順番に実行してください

-- ============================================
-- テーブル作成
-- ============================================

-- 1. projects（変更なし）
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number TEXT NOT NULL,
  project_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  client TEXT NOT NULL,
  status TEXT DEFAULT '見込み',
  billing_month DATE,
  billing_amount NUMERIC(12,0),
  invoice_receive_month DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. project_details（v2変更: guaranteed_views は自動計算なので保存しつつcomputed扱い）
CREATE TABLE project_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  budget NUMERIC(12,0),                      -- 予算 ← 入力
  unit_price NUMERIC(10,2),                  -- 再生単価 ← 入力（旧: 受注単価）
  guaranteed_views NUMERIC(14,2),            -- 保証再生回数 = budget / unit_price（自動算出・保存）
  retail_margin NUMERIC(5,4),                -- 小売マージン ← 入力
  agency_margin NUMERIC(5,4),                -- 代理店マージン ← 入力
  tonya_revenue NUMERIC(12,0),               -- 売上 = budget × (1 - retail_margin - agency_margin)（自動算出・保存）
  product_unit_price NUMERIC(10,0),          -- 商品単価 ← 入力
  review_unit_price NUMERIC(10,0),           -- 審査単価 ← 入力
  user_reward_unit_price NUMERIC(10,4),      -- ユーザー報酬単価 ← 入力
  extra_fields JSONB DEFAULT '{}',
  UNIQUE(project_id)
);

-- 3. project_costs（変更なし）
CREATE TABLE project_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL,
  cost_label TEXT NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  target_month DATE,
  UNIQUE(project_id, cost_type, target_month)
);

-- 4. project_subcontracts（★ v2で全面再設計）
-- 旧: YMS/エニドア/TONYA内製の固有カラム20個以上
-- 新: 汎用の委託先エントリ。最大3社。
CREATE TABLE project_subcontracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 1,     -- 1, 2, 3（表示順 兼 最大3社制限）
  company_name TEXT NOT NULL,                -- 委託先企業名（例: 'YMS', 'エニドア', 'アドベスト'）
  delegated_amount NUMERIC(12,0) DEFAULT 0,  -- 委託金額（実際の支払額。project_costsに連動）
  delegated_budget NUMERIC(12,0) DEFAULT 0,  -- 委託分予算
  delegated_revenue NUMERIC(12,0) DEFAULT 0, -- 委託分売上
  notes TEXT,                                -- 自由記入欄（詳細条件）
  UNIQUE(project_id, sort_order),
  CHECK (sort_order BETWEEN 1 AND 3)         -- 最大3社
);

-- 5. project_actuals（変更なし）
CREATE TABLE project_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  revenue NUMERIC(12,0),
  own_participants INTEGER,
  enidoor_participants INTEGER,
  own_views NUMERIC(14,0),
  own_view_cost NUMERIC(12,0),
  other_special_cost NUMERIC(12,0),
  ad_delivery_cost NUMERIC(12,0),
  product_cost NUMERIC(12,2),
  review_cost NUMERIC(12,0),
  enidoor_payment NUMERIC(12,0),
  other_agency_payment NUMERIC(12,0),
  yms_payment NUMERIC(12,0),
  gross_profit NUMERIC(12,0),
  gross_profit_rate NUMERIC(10,10),
  UNIQUE(project_id)
);

-- 6. fixed_costs（変更なし）
CREATE TABLE fixed_costs (
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

-- 7〜11: personnel, personnel_payments, influencers,
--        influencer_payments, invoices（全て変更なし）

CREATE TABLE personnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE personnel_payments (
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

CREATE TABLE influencers (
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

CREATE TABLE influencer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  target_month DATE NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  transfer_status TEXT DEFAULT '未実行',
  UNIQUE(influencer_id, target_month)
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  target_month DATE NOT NULL,
  sent_date DATE,
  invoice_file_name TEXT,
  total_amount_tax_included NUMERIC(12,0),
  note TEXT,
  payment_status TEXT DEFAULT '未払い',
  project_id UUID REFERENCES projects(id),
  UNIQUE(direction, counterparty, target_month)
);

-- ============================================
-- ビュー: 月次PLサマリー
-- ============================================

CREATE OR REPLACE VIEW monthly_pl_view AS
WITH months AS (
  SELECT generate_series('2025-11-01'::date, '2026-12-01'::date, '1 month')::date AS month
),
revenue AS (
  SELECT billing_month AS month, SUM(billing_amount) AS total_revenue
  FROM projects WHERE billing_amount IS NOT NULL
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
project_cost AS (
  SELECT target_month AS month, SUM(amount) AS total
  FROM project_costs
  GROUP BY target_month
)
SELECT
  m.month,
  COALESCE(r.total_revenue, 0) AS revenue,
  COALESCE(eg.total, 0) AS e_guardian_cost,
  COALESCE(p.total, 0) AS personnel_cost,
  COALESCE(pc.total, 0) AS project_cost,
  COALESCE(eg.total, 0) + COALESCE(p.total, 0) + COALESCE(pc.total, 0) AS total_cost,
  COALESCE(r.total_revenue, 0) - COALESCE(eg.total, 0) - COALESCE(p.total, 0) - COALESCE(pc.total, 0) AS operating_profit
FROM months m
LEFT JOIN revenue r ON r.month = m.month
LEFT JOIN e_guardian eg ON eg.month = m.month
LEFT JOIN personnel p ON p.month = m.month
LEFT JOIN project_cost pc ON pc.month = m.month
ORDER BY m.month;

-- ============================================
-- ビュー: ダッシュボード内訳展開用（★ v2新規追加）
-- ============================================

-- 案件別の月次売上（アコーディオン展開用）
CREATE OR REPLACE VIEW monthly_revenue_detail AS
SELECT
  billing_month AS month,
  id AS project_id,
  display_name,
  billing_amount,
  status
FROM projects
WHERE billing_amount IS NOT NULL AND billing_amount > 0
ORDER BY billing_month, project_number;

-- 案件別の月次コスト（アコーディオン展開用）
CREATE OR REPLACE VIEW monthly_cost_detail AS
SELECT
  pc.target_month AS month,
  p.id AS project_id,
  p.display_name,
  pc.cost_type,
  pc.cost_label,
  pc.amount
FROM project_costs pc
JOIN projects p ON p.id = pc.project_id
WHERE pc.amount > 0
ORDER BY pc.target_month, p.project_number, pc.cost_type;

-- ============================================
-- RLS (Row Level Security)
-- ============================================

DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'projects','project_details','project_costs','project_subcontracts',
      'project_actuals','fixed_costs','personnel','personnel_payments',
      'influencers','influencer_payments','invoices'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY "auth_full_access" ON %I FOR ALL USING (auth.role() = ''authenticated'')',
      tbl
    );
  END LOOP;
END $$;

-- ============================================
-- トリガー（updated_at自動更新）
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
