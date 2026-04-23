import { createClient } from '@/lib/supabase/server'

export interface PaymentItem {
  id: string
  category: 'subcontract' | 'personnel' | 'e_guardian' | 'influencer'
  payee: string
  campaignName: string | null
  campaignId: number | null
  amount: number
  targetMonth: string
  status: string
  sourceTable: string
  sourceId: string
}

export async function getPaymentItems(month?: string): Promise<PaymentItem[]> {
  const supabase = await createClient()
  const items: PaymentItem[] = []

  // 1. 外注先支払い (campaign_costs with subcontract type)
  {
    let query = supabase
      .from('campaign_costs')
      .select('*, campaigns(id, maker, product)')
      .like('cost_type', 'subcontract_%')
    if (month) query = query.eq('target_month', month)
    const { data } = await query
    for (const row of data || []) {
      const c = row.campaigns as { id?: number; maker?: string; product?: string } | null
      items.push({
        id: `sub-${row.id}`,
        category: 'subcontract',
        payee: row.cost_label?.replace(' 支払額', '') || '',
        campaignName: c ? `${c.maker} ${c.product}` : null,
        campaignId: c?.id || null,
        amount: Number(row.amount),
        targetMonth: row.target_month,
        status: '未払い',
        sourceTable: 'campaign_costs',
        sourceId: row.id,
      })
    }
  }

  // 2. 人件費 (personnel_payments + personnel)
  {
    let query = supabase
      .from('personnel_payments')
      .select('*, personnel(name, role)')
    if (month) query = query.eq('target_month', month)
    const { data } = await query
    for (const row of data || []) {
      const p = row.personnel as { name?: string; role?: string } | null
      items.push({
        id: `per-${row.id}`,
        category: 'personnel',
        payee: p?.name || '不明',
        campaignName: null,
        campaignId: null,
        amount: Number(row.amount),
        targetMonth: row.target_month,
        status: row.status || '見込み',
        sourceTable: 'personnel_payments',
        sourceId: row.id,
      })
    }
  }

  // 3. イー・ガーディアン (fixed_costs)
  {
    let query = supabase
      .from('fixed_costs')
      .select('*')
      .eq('cost_category', 'e_guardian')
    if (month) query = query.eq('target_month', month)
    const { data } = await query
    for (const row of data || []) {
      items.push({
        id: `eg-${row.id}`,
        category: 'e_guardian',
        payee: `イー・ガーディアン（${row.cost_subcategory}）`,
        campaignName: null,
        campaignId: null,
        amount: Number(row.amount),
        targetMonth: row.target_month,
        status: row.status || '見込み',
        sourceTable: 'fixed_costs',
        sourceId: row.id,
      })
    }
  }

  // 4. インフルエンサー (monthly aggregate)
  {
    let query = supabase
      .from('influencer_payments')
      .select('target_month, amount, transfer_status')
    if (month) query = query.eq('target_month', month)
    const { data } = await query
    const byMonth: Record<string, { total: number; count: number; statusCounts: Record<string, number> }> = {}
    for (const row of data || []) {
      const m = row.target_month
      if (!byMonth[m]) byMonth[m] = { total: 0, count: 0, statusCounts: {} }
      byMonth[m].total += Number(row.amount)
      byMonth[m].count++
      const st = row.transfer_status || '未実行'
      byMonth[m].statusCounts[st] = (byMonth[m].statusCounts[st] || 0) + 1
    }
    for (const [m, agg] of Object.entries(byMonth)) {
      const dominantStatus = Object.entries(agg.statusCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '未実行'
      items.push({
        id: `inf-${m}`,
        category: 'influencer',
        payee: `インフルエンサー（${agg.count}名）`,
        campaignName: null,
        campaignId: null,
        amount: agg.total,
        targetMonth: m,
        status: dominantStatus,
        sourceTable: 'influencer_payments',
        sourceId: m,
      })
    }
  }

  items.sort((a, b) => {
    if (a.targetMonth !== b.targetMonth) return a.targetMonth.localeCompare(b.targetMonth)
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return b.amount - a.amount
  })

  return items
}
