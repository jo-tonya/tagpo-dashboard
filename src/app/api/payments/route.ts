import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PaymentItem {
  id: string
  category: 'subcontract' | 'personnel' | 'e_guardian' | 'user_reward'
  payee: string
  campaignName: string | null
  campaignId: number | null
  amount: number
  targetMonth: string
  status: string
  sourceTable: string
  sourceId: string
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const supabase = await createClient()
    const items: PaymentItem[] = []

    // 1. Subcontract payments
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

    // 2. Personnel payments
    {
      let query = supabase
        .from('personnel_payments')
        .select('*, personnel(name, role)')
      if (month) query = query.eq('target_month', month)
      const { data } = await query
      for (const row of data || []) {
        const p = row.personnel as { name?: string } | null
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

    // 3. E-Guardian (fixed_costs)
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

    // 4. User reward payments
    {
      let query = supabase
        .from('campaign_costs')
        .select('*, campaigns(id, maker, product)')
        .eq('cost_type', 'tonya_user_payment')
      if (month) query = query.eq('target_month', month)
      const { data } = await query
      for (const row of data || []) {
        const c = row.campaigns as { id?: number; maker?: string; product?: string } | null
        items.push({
          id: `reward-${row.id}`,
          category: 'user_reward',
          payee: 'ユーザー報酬',
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

    items.sort((a, b) => {
      if (a.targetMonth !== b.targetMonth) return a.targetMonth.localeCompare(b.targetMonth)
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return b.amount - a.amount
    })

    return NextResponse.json(items)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
