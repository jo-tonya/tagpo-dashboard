import { createClient } from '@/lib/supabase/server'

export interface ReceivableItem {
  id: string
  campaignId: number
  campaignName: string
  billingMonth: string
  receiveMonth: string
  expectedAmount: number
  actualAmount: number | null
  status: string
  note: string | null
}

export async function getReceivables(month?: string): Promise<ReceivableItem[]> {
  const supabase = await createClient()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, maker, product, view_complete, billing_amount, certainty')
    .not('view_complete', 'is', null)
    .not('billing_amount', 'is', null)

  const { data: receivables } = await supabase
    .from('receivables')
    .select('*')

  const receivableMap: Record<number, Record<string, unknown>> = {}
  for (const r of receivables || []) {
    receivableMap[r.campaign_id as number] = r
  }

  const items: ReceivableItem[] = []
  for (const c of campaigns || []) {
    const billingMonthStr = `${(c.view_complete as string).slice(0, 7)}-01`
    const [y, m] = (c.view_complete as string).slice(0, 7).split('-').map(Number)
    const nm = m === 12 ? 1 : m + 1
    const ny = m === 12 ? y + 1 : y
    const receiveMonth = `${ny}-${String(nm).padStart(2, '0')}-01`

    if (month && receiveMonth.slice(0, 7) !== month.slice(0, 7)) continue

    const existing = receivableMap[c.id]

    items.push({
      id: (existing?.id as string) || `auto-${c.id}`,
      campaignId: c.id,
      campaignName: `${c.maker} ${c.product}`,
      billingMonth: billingMonthStr,
      receiveMonth,
      expectedAmount: Number(c.billing_amount),
      actualAmount: existing?.actual_amount ? Number(existing.actual_amount) : null,
      status: (existing?.status as string) || '未入金',
      note: (existing?.note as string) || null,
    })
  }

  items.sort((a, b) => a.receiveMonth.localeCompare(b.receiveMonth))
  return items
}
