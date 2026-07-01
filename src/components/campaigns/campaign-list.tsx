'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Campaign, getBillingMonth } from '@/lib/types'
import { calcCampaignProfit, formatCurrency, formatMonth } from '@/lib/calculations'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CERTAINTY_RANK, CertaintyFilterBar, useCertaintyFilter } from '@/components/shared/certainty-filter'

interface CostMaps {
  subcontractByCampaign: Record<number, number>
  adDeliveryByCampaign: Record<number, number>
  productByCampaign: Record<number, number>
  miscByCampaign: Record<number, number>
}

interface CampaignListProps {
  campaigns: Campaign[]
  costMaps?: CostMaps
}

// §19-3: 旧 StatusBadge は削除（status 列を案件一覧から外したため）。
//   ※ status カラム自体は DB / 案件詳細では維持される。
// §15-4-1: 案件種別バッジ
const CATEGORY_BADGE_COLORS: Record<string, string> = {
  'Tagpo':           'bg-blue-100 text-blue-800',
  'POSCO':           'bg-emerald-100 text-emerald-800',
  'インフルエンサー': 'bg-pink-100 text-pink-800',
  'その他':           'bg-gray-100 text-gray-700',
}
function CategoryBadge({ category }: { category: string }) {
  return <Badge className={CATEGORY_BADGE_COLORS[category] || CATEGORY_BADGE_COLORS['その他']}>{category}</Badge>
}

// §12-3: 5値の確度色、§18 で F.失注 を追加
const CERTAINTY_LIST = ['A.完了', 'B.進行中', 'C.受注確定', 'D.見込み+', 'E.見込み-', 'F.失注'] as const
const CERTAINTY_COLORS: Record<string, string> = {
  'A.完了':      'text-green-700',
  'B.進行中':    'text-blue-700',
  'C.受注確定':  'text-indigo-700',
  'D.見込み+':   'text-yellow-700',
  'E.見込み-':   'text-gray-600',
  'F.失注':     'text-red-700 line-through',
  // 旧値の後方互換
  '確定':       'text-green-700',
  '見込み':     'text-blue-700',
  '未確定':     'text-yellow-700',
}

type SortOrder = 'billing_month_desc' | 'billing_month_asc' | 'budget_desc' | 'billing_amount_desc' | 'certainty_asc'

// §15-4-2: 並び順の表示ラベル。
//   base-ui の Select.Value は既定で「選択値（内部コード）」を出すため、
//   トリガーに日本語ラベルを出すにはこの対応表で明示的に変換する（SelectItem と文言を統一）。
const SORT_LABELS: Record<SortOrder, string> = {
  billing_month_desc: '請求月（新しい順）',
  billing_month_asc: '請求月（古い順）',
  budget_desc: '予算（高い順）',
  billing_amount_desc: '売上（高い順）',
  certainty_asc: '確度（A→F）',
}

// §19-2: 旧 InlineRewardInput / handleRewardSave は削除（ユーザー報酬額列を一覧から外したため）。
//   案件詳細フォームで引き続き編集できる。

export function CampaignList({ campaigns, costMaps }: CampaignListProps) {
  const router = useRouter()

  // §15-4-2: フィルタ & 並び順
  // 確度フィルタは事業収入・事業コストと同一部品（CertaintyFilterBar）。初期は失注以外（A〜E）。
  const certaintyFilter = useCertaintyFilter()
  const [billingMonthFilter, setBillingMonthFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('billing_month_desc')

  const availableBillingMonths = useMemo(() => {
    const set = new Set<string>()
    campaigns.forEach(c => {
      const m = getBillingMonth(c)
      if (m) set.add(m)
    })
    return Array.from(set).sort().reverse()
  }, [campaigns])

  const visibleCampaigns = useMemo(() => {
    let list = campaigns
    // 確度フィルタ（収入・コストと同一。初期は失注以外）
    list = list.filter(c => certaintyFilter.matches(c.certainty))
    if (billingMonthFilter !== 'all') {
      list = list.filter(c => getBillingMonth(c) === billingMonthFilter)
    }
    return [...list].sort((a, b) => {
      switch (sortOrder) {
        case 'billing_month_desc':
          return (getBillingMonth(b) ?? '').localeCompare(getBillingMonth(a) ?? '')
        case 'billing_month_asc':
          return (getBillingMonth(a) ?? '').localeCompare(getBillingMonth(b) ?? '')
        case 'budget_desc':
          return (b.budget ?? 0) - (a.budget ?? 0)
        case 'billing_amount_desc':
          return (b.billing_amount ?? 0) - (a.billing_amount ?? 0)
        case 'certainty_asc': {
          // 確度順（A.完了 → F.失注）。未知値は最後尾。同確度は請求月の新しい順。
          const ra = CERTAINTY_RANK[a.certainty] ?? 99
          const rb = CERTAINTY_RANK[b.certainty] ?? 99
          if (ra !== rb) return ra - rb
          return (getBillingMonth(b) ?? '').localeCompare(getBillingMonth(a) ?? '')
        }
        default:
          return 0
      }
    })
  }, [campaigns, certaintyFilter, billingMonthFilter, sortOrder])

  async function handleCertaintyChange(id: number, certainty: string) {
    await fetch(`/api/campaigns/${id}/certainty`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certainty }),
    })
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {/* §15-4-2: フィルタバー */}
        <div className="flex items-center gap-3 p-3 border-b bg-gray-50 flex-wrap">
          {/* 確度フィルタ（事業収入・事業コストと同一部品） */}
          <CertaintyFilterBar filter={certaintyFilter} />

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Label className="text-sm whitespace-nowrap">請求月</Label>
            <Select value={billingMonthFilter} onValueChange={(v) => v && setBillingMonthFilter(v)}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="すべて">
                  {(v: string) => (v === 'all' ? 'すべて' : formatMonth(v))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {availableBillingMonths.map(m => (
                  <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label className="text-sm whitespace-nowrap">並び順</Label>
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue>{(v: SortOrder) => SORT_LABELS[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="billing_month_desc">請求月（新しい順）</SelectItem>
                <SelectItem value="billing_month_asc">請求月（古い順）</SelectItem>
                <SelectItem value="budget_desc">予算（高い順）</SelectItem>
                <SelectItem value="billing_amount_desc">売上（高い順）</SelectItem>
                <SelectItem value="certainty_asc">確度（A→F）</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>案件種別</TableHead>
              <TableHead>メーカー</TableHead>
              <TableHead>案件名</TableHead>
              <TableHead>請求先</TableHead>
              <TableHead className="text-right" title="請求月（再生完了月）">請求月</TableHead>
              <TableHead className="text-right">予算</TableHead>
              <TableHead className="text-right">売上</TableHead>
              <TableHead className="text-right">合計費用</TableHead>
              <TableHead className="text-right">粗利</TableHead>
              <TableHead className="text-center">確度</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleCampaigns.map((campaign) => {
              // §12-2: 案件単位の試算ベース
              const subcontractFee = costMaps?.subcontractByCampaign[campaign.id] ?? 0
              const adDeliveryCost = costMaps?.adDeliveryByCampaign[campaign.id] ?? 0
              const miscCost = costMaps?.miscByCampaign[campaign.id] ?? 0
              const profit = calcCampaignProfit({
                budget: campaign.budget ?? 0,
                unitPrice: campaign.unit_price ?? 0,
                avgViews: campaign.avg_views ?? 0,
                postersCount: campaign.posters_count ?? null,
                retailMargin: (campaign.retail_margin ?? 0) * 100,
                agencyMargin: (campaign.agency_margin ?? 0) * 100,
                productUnitPrice: campaign.product_unit_price ?? 0,
                reviewUnitPrice: campaign.review_unit_price ?? 1000,
                userRewardUnitPrice: campaign.user_reward_unit_price ?? 0.4,
                manualUserReward: campaign.user_reward_amount ?? null,
                certainty: campaign.certainty,
                subcontractFee,
                adDeliveryCost,
                miscCost,
              })
              const totalCost = (campaign.budget ?? 0) > 0 ? profit.cogsTotal : null
              const grossProfit = (campaign.budget ?? 0) > 0 ? profit.grossProfit : null
              const profitClass =
                grossProfit == null ? 'text-gray-400' :
                grossProfit > 0 ? 'text-green-700 font-medium' :
                grossProfit < 0 ? 'text-red-600 font-medium' : ''

              return (
                <TableRow key={campaign.id} className="cursor-pointer hover:bg-gray-50">
                  <TableCell>
                    <CategoryBadge category={campaign.category ?? 'Tagpo'} />
                  </TableCell>
                  <TableCell className="text-gray-600">{campaign.maker}</TableCell>
                  <TableCell>
                    <Link href={`/campaigns/${campaign.id}`} className="text-blue-600 hover:underline">
                      {campaign.product}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{campaign.billing_to || '—'}</TableCell>
                  <TableCell className="text-right text-sm">{formatMonth(getBillingMonth(campaign))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(campaign.budget)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(campaign.billing_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatCurrency(totalCost)}</TableCell>
                  <TableCell className={`text-right tabular-nums text-sm ${profitClass}`}>{formatCurrency(grossProfit)}</TableCell>
                  <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                    <Select
                      value={campaign.certainty || 'D.見込み+'}
                      onValueChange={(v) => v && handleCertaintyChange(campaign.id, v)}
                    >
                      <SelectTrigger className={`h-7 text-xs w-[110px] ${CERTAINTY_COLORS[campaign.certainty] || ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CERTAINTY_LIST.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              )
            })}
            {visibleCampaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-gray-500 py-8">
                  該当する案件がありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
