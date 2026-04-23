// Tagpo事業管理システム — 型定義（v3 統合版）

export type CampaignStatus = '未確定' | 'シート回収済み' | '進行中' | '投稿中' | '完了'
export type PaymentStatus = '未払い' | '支払い済' | '入金済'
export type InvoiceDirection = 'outgoing' | 'incoming'
export type TransferStatus = '未実行' | '実行' | '確認済'
export type CostType = 'subcontract_1' | 'subcontract_2' | 'subcontract_3' | 'tonya_user_payment' | 'ad_delivery'
export type CampaignCertainty = '未確定' | '見込み' | '確定'

// Campaign = 旧 Project + 旧 campaigns を統合
export interface Campaign {
  id: number  // campaigns テーブルは INTEGER（UUID ではない）
  maker: string
  product: string
  status: string
  certainty: string  // CampaignCertainty
  type: string
  budget: number | null
  unit_price: number | null
  avg_views: number | null
  influencers: string
  review: string
  url: string
  // マイルストーン日程
  es_collection: string | null
  info_release: string | null
  post_start: string | null
  post_end: string | null
  view_complete: string | null
  report_send: string | null
  memo: string
  // PL連携用（新規追加カラム）
  billing_amount: number | null
  retail_margin: number | null
  agency_margin: number | null
  product_unit_price: number | null
  review_unit_price: number | null
  user_reward_unit_price: number | null
  user_reward_amount: number | null
  // タイムスタンプ
  created_at: string
  updated_at: string
}

// 表示名の算出（ヘルパー関数）
export function campaignDisplayName(c: Campaign): string {
  return `${c.maker} ${c.product}`
}

// 再生完了月（YYYY-MM-DD 形式、月初）を返す。view_complete が未設定なら null。
// 旧 campaigns.billing_month カラムの代わりに、view_complete から請求月を算出する。
export function getBillingMonth(c: Pick<Campaign, 'view_complete'>): string | null {
  if (!c.view_complete) return null
  return `${c.view_complete.slice(0, 7)}-01`
}

// CampaignSubcontract（旧 ProjectSubcontract）
export interface CampaignSubcontract {
  id: string
  campaign_id: number
  sort_order: number
  company_name: string
  delegated_amount: number
  delegated_budget: number
  delegated_revenue: number
  notes: string | null
}

// CampaignCost（旧 ProjectCost）
export interface CampaignCost {
  id: string
  campaign_id: number
  cost_type: string
  cost_label: string
  amount: number
  note: string | null
  target_month: string | null
}

// MilestoneCheck（既存）
export interface MilestoneCheck {
  id: number
  campaign_id: number
  milestone_key: string
  checked: boolean
  checked_at: string | null
}

export interface FixedCost {
  id: string
  cost_category: string
  cost_subcategory: string
  target_month: string
  amount: number
  quantity: number | null
  unit_price: number | null
  status: string
  note: string | null
}

export interface Personnel {
  id: string
  name: string
  role: string | null
  is_active: boolean
  created_at: string
}

export interface PersonnelPayment {
  id: string
  personnel_id: string
  target_month: string
  amount: number
  payment_type: string
  quantity: number | null
  unit_price: number | null
  status: string
}

export interface Influencer {
  id: string
  number: string | null
  username: string
  registered_at: string | null
  respondent_name: string | null
  line_id: string | null
  bank_name: string | null
  bank_branch: string | null
  account_type: string | null
  account_number: string | null
  account_holder: string | null
  is_active: boolean
  created_at: string
}

export interface InfluencerPayment {
  id: string
  influencer_id: string
  target_month: string
  amount: number
  transfer_status: TransferStatus
}

export interface Invoice {
  id: string
  direction: InvoiceDirection
  counterparty: string
  target_month: string
  sent_date: string | null
  invoice_file_name: string | null
  total_amount_tax_included: number | null
  note: string | null
  payment_status: PaymentStatus
  campaign_id: number | null
}

// MonthlyPL — ビューから取得
export interface MonthlyPL {
  month: string
  revenue: number
  e_guardian_cost: number
  personnel_cost: number
  user_reward_cost: number
  project_cost: number
  total_cost: number
  operating_profit: number
}

// ダッシュボード展開用
export interface RevenueDetail {
  month: string
  campaign_id: number
  display_name: string
  billing_amount: number
  status: string
  certainty: string
}

export interface CostDetail {
  month: string
  campaign_id: number
  display_name: string
  cost_type: string
  cost_label: string
  amount: number
}
