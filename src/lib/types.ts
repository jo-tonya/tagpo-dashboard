// Tagpo事業管理システム — 型定義（v3 統合版）

export type CampaignStatus = '未確定' | 'シート回収済み' | '進行中' | '投稿中' | '完了'
export type PaymentStatus = '未払い' | '支払い済' | '入金済'
export type InvoiceDirection = 'outgoing' | 'incoming'
export type TransferStatus = '未実行' | '実行' | '確認済'
export type CostType =
  | 'subcontract_1'
  | 'subcontract_2'
  | 'subcontract_3'
  | 'tonya_user_payment'
  | 'ad_delivery'
  | 'misc'              // その他諸経費（手入力）
  | 'product_cost'      // 商品代 = posters_count × product_unit_price（§12-1 復活）
  // ※ 'review_cost' は §11 で DB 書込廃止（EG ページの fixed_costs 由来に一本化）。
  //   案件単位の試算値は粗利サマリー UI のみ（DB 書込なし）。

// 確度（§12-3 で 5 値に拡張、§18 で F.失注 を追加）
export type CampaignCertainty =
  | 'A.完了'
  | 'B.進行中'
  | 'C.受注確定'
  | 'D.見込み+'
  | 'E.見込み-'
  | 'F.失注'

// 案件種別（§15-3 で追加。DB は campaign_category_t ENUM）
export type CampaignCategory = 'Tagpo' | 'POSCO' | 'インフルエンサー' | 'その他'
export const CAMPAIGN_CATEGORIES: readonly CampaignCategory[] = [
  'Tagpo', 'POSCO', 'インフルエンサー', 'その他',
] as const

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
  // §12-4: 案件ボードの追加メモ項目
  creative_notes: string  // クリエイティブの追加指示
  schedule_notes: string  // スケジュール、進行の注意点
  // §15-1/2: 請求先（自由入力）と案件種別
  billing_to: string | null
  category: CampaignCategory | null
  // PL連携用（新規追加カラム）
  billing_amount: number | null
  retail_margin: number | null
  agency_margin: number | null
  product_unit_price: number | null  // §12-1 復活: 商品単価
  review_unit_price: number | null
  user_reward_unit_price: number | null
  user_reward_amount: number | null
  posters_count: number | null  // 投稿者数（実投稿数）— 審査費 = posters_count × review_unit_price
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
  delegated_revenue: number
  notes: string | null
  billing_month: string | null  // §16: 外注先ごとの請求月（'YYYY-MM-DD'、月初）
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

// MonthlyBudget — /budgets で月単位に入力（売上予算・粗利率）
export interface MonthlyBudget {
  month: string                // 'YYYY-MM-01'
  revenue: number              // 売上予算（円）
  gross_margin_rate: number    // 0.0 〜 1.0（DB は NUMERIC(5,4)）
  note: string | null
}

// MonthlyPL — ビューから取得
// v9 モデル (§17): マージンを売上控除に分類、販管費から外す
//   売上構造:
//     budget                = SUM(campaigns.budget)        — 案件予算
//     retail_margin_cost    = SUM(budget × retail_margin)  — 小売マージン
//     agency_margin_cost    = SUM(budget × agency_margin)  — 代理店マージン
//     margin_total          = retail + agency              — マージン合計（売上控除分）
//     revenue               = SUM(campaigns.billing_amount) — 売上（= budget − margin_total、手動上書きあり）
//   原価6項目（マージン含まず）+ cogs_total
//   販管費2項目（eg_admin/personnel のみ。agency_fee_cost は廃止）+ sga_total
//   集計:
//     gross_profit          = revenue − cogs_total
//     operating_profit      = gross_profit − sga_total
export interface MonthlyPL {
  month: string
  // 売上構造
  budget: number
  retail_margin_cost: number
  agency_margin_cost: number
  margin_total: number
  revenue: number
  // 原価（COGS, 6 項目）
  review_cost: number
  user_reward_cost: number
  product_cost: number
  subcontract_cost: number
  ad_delivery_cost: number
  misc_cost: number
  cogs_total: number
  // 販管費（SG&A, 2 項目。マージンは含めない）
  eg_admin_cost: number
  personnel_cost: number
  sga_total: number
  // 集計
  gross_profit: number
  operating_profit: number
  // 互換維持
  e_guardian_cost: number   // = review_cost + eg_admin_cost（補足表示用）
  total_cost: number        // = cogs_total + sga_total（旧呼び元向け）
}

// ダッシュボード展開用
export interface RevenueDetail {
  month: string
  campaign_id: number
  display_name: string
  budget: number              // 案件予算（campaigns.budget）
  billing_amount: number      // 売上（campaigns.billing_amount）
  retail_margin_amount: number // §17 新規: 小売マージン金額
  agency_margin_amount: number // §17 新規: 代理店マージン金額
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
