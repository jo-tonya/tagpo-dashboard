import { createClient } from '@/lib/supabase/server'
import {
  KpiActuals,
  KpiBucketed,
  KpiManualValue,
  KpiManualKind,
  KpiMetricKey,
  KpiAction,
} from '../types'

// KPI マトリクスの対象月（2025-11 〜 2026-12 を基本に、現在月が後ろならそこまで延長）
export function getKpiMonths(): string[] {
  const start = '2025-11-01'
  const today = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const end = curMonth > '2026-12-01' ? curMonth : '2026-12-01'

  const months: string[] = []
  const [sy, sm] = start.slice(0, 7).split('-').map(Number)
  const [ey, em] = end.slice(0, 7).split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

// 確度 → バケット。'A'/'B'/'C' = 確定, 'D'/'E' = 未確定, 'F' = 対象外(null)
function bucketOf(certainty: string | null): 'confirmed' | 'unconfirmed' | null {
  const head = (certainty || '').charAt(0)
  if (head === 'A' || head === 'B' || head === 'C') return 'confirmed'
  if (head === 'D' || head === 'E') return 'unconfirmed'
  return null  // F.失注 など
}

// 請求先 → チャネル分類
//   アドインテ      : billing_to === 'アドインテ'
//   自社チャネル    : billing_to 空 or メーカー名と同じ（直取引）
//   新規代理店      : 上記以外（アドインテでもメーカー名でもない代理店）
function channelOf(billingTo: string | null, maker: string): 'adinte' | 'own' | 'new_agency' {
  const bt = (billingTo || '').trim()
  if (bt === 'アドインテ') return 'adinte'
  if (bt === '' || bt === (maker || '').trim()) return 'own'
  return 'new_agency'
}

// 売上系 KPI の月次実績を campaigns から算出。
export async function getKpiActuals(): Promise<KpiActuals> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('maker, billing_to, certainty, billing_amount, view_complete')
    .not('view_complete', 'is', null)
    .not('billing_amount', 'is', null)
  if (error) {
    console.error('Error fetching campaigns for KPI:', error)
    return {}
  }

  const actuals: KpiActuals = {}
  // 新規代理店の異なり数を数えるため、月×バケットごとに会社名の集合を持つ
  const agencySets: Record<string, Record<'confirmed' | 'unconfirmed', Set<string>>> = {}

  const ensure = (month: string, key: KpiMetricKey): KpiBucketed => {
    if (!actuals[month]) actuals[month] = {}
    if (!actuals[month][key]) actuals[month][key] = { confirmed: 0, unconfirmed: 0 }
    return actuals[month][key] as KpiBucketed
  }

  for (const c of data || []) {
    const vc = c.view_complete as string | null
    if (!vc) continue
    const bucket = bucketOf(c.certainty as string | null)
    if (!bucket) continue
    const month = `${vc.slice(0, 7)}-01`
    const amount = Number(c.billing_amount) || 0
    const channel = channelOf(c.billing_to as string | null, c.maker as string)

    if (channel === 'adinte') {
      ensure(month, 'adinte_revenue')[bucket] += amount
      ensure(month, 'adinte_count')[bucket] += 1
    } else if (channel === 'own') {
      ensure(month, 'own_revenue')[bucket] += amount
      ensure(month, 'own_count')[bucket] += 1
    } else {
      ensure(month, 'new_agency_revenue')[bucket] += amount
      ensure(month, 'new_agency_deals')[bucket] += 1
      if (!agencySets[month]) agencySets[month] = { confirmed: new Set(), unconfirmed: new Set() }
      agencySets[month][bucket].add((c.billing_to as string).trim())
    }
  }

  // 新規代理店数 = 異なり社数
  for (const [month, sets] of Object.entries(agencySets)) {
    const k = ensure(month, 'new_agency_kinds')
    k.confirmed = sets.confirmed.size
    k.unconfirmed = sets.unconfirmed.size
  }

  return actuals
}

// 手入力値（目標／ユーザー系実績）。キー `${month}|${metric_key}|${kind}` → value
export async function getKpiManualValues(): Promise<Record<string, number>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('kpi_manual_values').select('*')
  if (error) {
    console.error('Error fetching kpi_manual_values:', error)
    return {}
  }
  const map: Record<string, number> = {}
  for (const row of data || []) {
    map[`${row.month}|${row.metric_key}|${row.kind}`] = Number(row.value) || 0
  }
  return map
}

export async function upsertKpiManualValue(v: KpiManualValue) {
  const supabase = await createClient()
  return await supabase
    .from('kpi_manual_values')
    .upsert(
      { month: v.month, metric_key: v.metric_key, kind: v.kind, value: v.value, updated_at: new Date().toISOString() },
      { onConflict: 'month,metric_key,kind' },
    )
}

// 月ごとの重要アクション
export async function getKpiActions(): Promise<KpiAction[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kpi_actions')
    .select('*')
    .order('sort_order')
    .order('created_at')
  if (error) {
    console.error('Error fetching kpi_actions:', error)
    return []
  }
  return (data || []).map(r => ({
    id: r.id as string,
    month: r.month as string,
    text: (r.text as string) || '',
    checked: Boolean(r.checked),
    sort_order: Number(r.sort_order) || 0,
  }))
}

export async function createKpiAction(month: string, text: string, sortOrder: number) {
  const supabase = await createClient()
  return await supabase.from('kpi_actions').insert({ month, text, sort_order: sortOrder })
}

export async function updateKpiAction(id: string, patch: { text?: string; checked?: boolean }) {
  const supabase = await createClient()
  return await supabase.from('kpi_actions').update(patch).eq('id', id)
}

export async function deleteKpiAction(id: string) {
  const supabase = await createClient()
  return await supabase.from('kpi_actions').delete().eq('id', id)
}

export type { KpiManualKind, KpiMetricKey }
