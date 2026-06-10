import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// 派生コスト（misc / ad_delivery / product / tonya_user_payment）を一括 upsert する。
// body: { miscCost, adDelivery, productCost, userReward } 各 number | null
// null/0 のキーは削除、>0 のキーは upsert（target_month は campaigns.view_complete の月初）
// ※ review_cost は §11 で DB 書込廃止（body.reviewCost が来ても無視）。
//    ダッシュボードの審査費は EG ページ（fixed_costs）から取得する。
// ※ product_cost は §12-1 で復活（方針 B: ダッシュボードにも表示）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaignId = parseInt(id)
  const body = await request.json()
  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('view_complete')
    .eq('id', campaignId)
    .single()

  const targetMonth = campaign?.view_complete
    ? `${campaign.view_complete.slice(0, 7)}-01`
    : null

  // (cost_type, label) のセット
  const items: { type: string; label: string; amount: number | null }[] = [
    { type: 'tonya_user_payment', label: 'ユーザー報酬', amount: numberOrNull(body.userReward) },
    { type: 'ad_delivery',        label: '広告配信費',   amount: numberOrNull(body.adDelivery) },
    { type: 'product_cost',       label: '商品代',       amount: numberOrNull(body.productCost) },
    { type: 'misc',               label: 'その他諸経費', amount: numberOrNull(body.miscCost) },
  ]

  for (const item of items) {
    if (item.amount == null || item.amount <= 0) {
      await supabase
        .from('campaign_costs')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('cost_type', item.type)
      continue
    }

    const { data: existing } = await supabase
      .from('campaign_costs')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('cost_type', item.type)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('campaign_costs')
        .update({ amount: item.amount, target_month: targetMonth })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('campaign_costs')
        .insert({
          campaign_id: campaignId,
          cost_type: item.type,
          cost_label: item.label,
          amount: item.amount,
          target_month: targetMonth,
        })
    }
  }

  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true })
}

function numberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
