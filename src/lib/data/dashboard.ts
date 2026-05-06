import { createClient } from '@/lib/supabase/server'
import { MonthlyPL, RevenueDetail, CostDetail } from '../types'

export interface CostStatusDetail {
  source:
    | 'e_guardian'
    | 'personnel'
    | 'user_reward'
    | 'subcontract'
    | 'ad_delivery'
    | 'review'
    | 'product'
    | 'misc'
  target_month: string
  amount: number
  status: string
}

export async function getMonthlyPL(): Promise<MonthlyPL[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_pl_view')
    .select('*')
    .order('month')
  if (error) {
    console.error('Error fetching monthly PL:', error)
    return []
  }
  return (data || []).map((row: Record<string, unknown>) => ({
    month: row.month as string,
    revenue: Number(row.revenue) || 0,
    review_cost: Number(row.review_cost) || 0,
    user_reward_cost: Number(row.user_reward_cost) || 0,
    product_cost: Number(row.product_cost) || 0,
    subcontract_cost: Number(row.subcontract_cost) || 0,
    ad_delivery_cost: Number(row.ad_delivery_cost) || 0,
    misc_cost: Number(row.misc_cost) || 0,
    agency_fee_cost: Number(row.agency_fee_cost) || 0,
    personnel_cost: Number(row.personnel_cost) || 0,
    e_guardian_cost: Number(row.e_guardian_cost) || 0,
    cogs_total: Number(row.cogs_total) || 0,
    sga_total: Number(row.sga_total) || 0,
    total_cost: Number(row.total_cost) || 0,
    operating_profit: Number(row.operating_profit) || 0,
  }))
}

export async function getRevenueDetails(): Promise<RevenueDetail[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_revenue_detail')
    .select('*')
    .order('month')
  if (error) {
    console.error('Error fetching revenue details:', error)
    return []
  }
  return (data || []).map((row: Record<string, unknown>) => ({
    month: row.month as string,
    campaign_id: row.campaign_id as number,
    display_name: row.display_name as string,
    billing_amount: Number(row.billing_amount) || 0,
    status: (row.status as string) || '',
    certainty: (row.certainty as string) || '未確定',
  }))
}

export async function getCostDetails(): Promise<CostDetail[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_cost_detail')
    .select('*')
    .order('month')
  if (error) {
    console.error('Error fetching cost details:', error)
    return []
  }
  return (data || []).map((row: Record<string, unknown>) => ({
    month: row.month as string,
    campaign_id: row.campaign_id as number,
    display_name: row.display_name as string,
    cost_type: (row.cost_type as string) || '',
    cost_label: (row.cost_label as string) || '',
    amount: Number(row.amount) || 0,
  }))
}

export async function getCostStatusDetails(): Promise<CostStatusDetail[]> {
  const supabase = await createClient()
  const { data: egData } = await supabase
    .from('fixed_costs')
    .select('target_month, amount, status')
    .eq('cost_category', 'e_guardian')
  const { data: personnelData } = await supabase
    .from('personnel_payments')
    .select('target_month, amount, status')

  const results: CostStatusDetail[] = []
  for (const row of egData || []) {
    results.push({
      source: 'e_guardian',
      target_month: row.target_month,
      amount: Number(row.amount) || 0,
      status: row.status || '見込み',
    })
  }
  for (const row of personnelData || []) {
    results.push({
      source: 'personnel',
      target_month: row.target_month,
      amount: Number(row.amount) || 0,
      status: row.status || '見込み',
    })
  }

  // 案件由来コスト（campaign_costs + campaigns.certainty）を cost_type で振り分け
  //   tonya_user_payment       → user_reward
  //   subcontract_1/2/3        → subcontract
  //   ad_delivery              → ad_delivery
  //   review_cost              → review
  //   product_cost             → product
  //   misc                     → misc
  const { data: ccData } = await supabase
    .from('campaign_costs')
    .select('target_month, amount, campaign_id, cost_type')
    .in('cost_type', [
      'tonya_user_payment',
      'subcontract_1', 'subcontract_2', 'subcontract_3',
      'ad_delivery',
      'review_cost', 'product_cost', 'misc',
    ])

  if (ccData && ccData.length > 0) {
    const campaignIds = Array.from(new Set(ccData.map(r => r.campaign_id)))
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('id, certainty')
      .in('id', campaignIds)
    const certaintyMap: Record<number, string> = {}
    for (const c of campaignData || []) {
      certaintyMap[c.id] = c.certainty || '未確定'
    }
    for (const row of ccData) {
      if (!row.target_month) continue
      let source: CostStatusDetail['source']
      if (row.cost_type === 'tonya_user_payment') source = 'user_reward'
      else if (row.cost_type === 'ad_delivery') source = 'ad_delivery'
      else if (row.cost_type === 'review_cost') source = 'review'
      else if (row.cost_type === 'product_cost') source = 'product'
      else if (row.cost_type === 'misc') source = 'misc'
      else source = 'subcontract'
      results.push({
        source,
        target_month: row.target_month,
        amount: Number(row.amount) || 0,
        status: certaintyMap[row.campaign_id] || '未確定',
      })
    }
  }

  return results
}
