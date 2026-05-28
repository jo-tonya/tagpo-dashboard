'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Campaign, CampaignCategory, CAMPAIGN_CATEGORIES, getBillingMonth } from '@/lib/types'
import {
  calcUserRewardAmount,
  calcCampaignProfit,
  formatCurrency,
  formatMonth,
} from '@/lib/calculations'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    '未確定': 'bg-gray-100 text-gray-600',
    'シート回収済み': 'bg-orange-100 text-orange-700',
    '進行中': 'bg-blue-100 text-blue-700',
    '投稿中': 'bg-purple-100 text-purple-700',
    '完了': 'bg-green-100 text-green-700',
  }
  return <Badge className={colors[status] || 'bg-gray-100 text-gray-500'}>{status}</Badge>
}

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

// §12-3: 5値の確度色
const CERTAINTY_LIST = ['A.完了', 'B.進行中', 'C.受注確定', 'D.見込み+', 'E.見込み-'] as const
const CERTAINTY_COLORS: Record<string, string> = {
  'A.完了':      'text-green-700',
  'B.進行中':    'text-blue-700',
  'C.受注確定':  'text-indigo-700',
  'D.見込み+':   'text-yellow-700',
  'E.見込み-':   'text-gray-600',
  // 旧値の後方互換
  '確定':       'text-green-700',
  '見込み':     'text-blue-700',
  '未確定':     'text-yellow-700',
}

type SortOrder = 'billing_month_desc' | 'billing_month_asc' | 'budget_desc' | 'billing_amount_desc'

function InlineRewardInput({ currentAmount, isManual, onSave }: {
  currentAmount: number | null
  isManual: boolean
  onSave: (amount: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentAmount?.toString() || '')

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:underline tabular-nums text-sm ${isManual ? 'text-black font-medium' : 'text-gray-400'}`}
        onClick={() => { setValue(currentAmount?.toString() || ''); setEditing(true) }}
        title={isManual ? '手動入力値' : '自動計算値（クリックで上書き）'}
      >
        {currentAmount ? formatCurrency(currentAmount) : '—'}
      </span>
    )
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      className="h-7 text-xs w-[120px] text-right"
      value={value}
      autoFocus
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '')
        if (raw === '' || /^-?\d*$/.test(raw)) setValue(raw)
      }}
      onBlur={() => {
        const num = parseFloat(value)
        onSave(isNaN(num) || num <= 0 ? null : num)
        setEditing(false)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

export function CampaignList({ campaigns, costMaps }: CampaignListProps) {
  const router = useRouter()

  // §15-4-2: フィルタ & 並び順
  const [categoryFilter, setCategoryFilter] = useState<'all' | CampaignCategory>('all')
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
    if (categoryFilter !== 'all') {
      list = list.filter(c => (c.category ?? 'Tagpo') === categoryFilter)
    }
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
        default:
          return 0
      }
    })
  }, [campaigns, categoryFilter, billingMonthFilter, sortOrder])

  async function handleCertaintyChange(id: number, certainty: string) {
    await fetch(`/api/campaigns/${id}/certainty`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certainty }),
    })
    router.refresh()
  }

  async function handleRewardSave(id: number, amount: number | null) {
    await fetch(`/api/campaigns/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_reward_amount: amount }),
    })
    await fetch(`/api/campaigns/${id}/sync-reward-cost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {/* §15-4-2: フィルタバー */}
        <div className="flex items-center gap-3 p-3 border-b bg-gray-50 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            <Button
              size="sm"
              variant={categoryFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setCategoryFilter('all')}
            >
              すべて
            </Button>
            {CAMPAIGN_CATEGORIES.map(c => (
              <Button
                key={c}
                size="sm"
                variant={categoryFilter === c ? 'default' : 'outline'}
                onClick={() => setCategoryFilter(c)}
              >
                {c}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Label className="text-sm whitespace-nowrap">請求月</Label>
            <Select value={billingMonthFilter} onValueChange={(v) => v && setBillingMonthFilter(v)}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="すべて" />
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
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="billing_month_desc">請求月（新しい順）</SelectItem>
                <SelectItem value="billing_month_asc">請求月（古い順）</SelectItem>
                <SelectItem value="budget_desc">予算（高い順）</SelectItem>
                <SelectItem value="billing_amount_desc">売上（高い順）</SelectItem>
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
              <TableHead className="text-right">ユーザー報酬額</TableHead>
              <TableHead className="text-center">ステータス</TableHead>
              <TableHead className="text-center">確度</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleCampaigns.map((campaign) => {
              const rewardAmount = calcUserRewardAmount(
                campaign.user_reward_amount,
                campaign.budget,
                campaign.unit_price,
                campaign.user_reward_unit_price
              )
              const isManual = campaign.user_reward_amount != null && campaign.user_reward_amount > 0

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
                subcontractFee,
                adDeliveryCost,
                miscCost,
              })
              const totalCost = (campaign.budget ?? 0) > 0 ? profit.totalCost : null
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
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <InlineRewardInput
                      currentAmount={rewardAmount}
                      isManual={isManual}
                      onSave={(amount) => handleRewardSave(campaign.id, amount)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={campaign.status} />
                  </TableCell>
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
                <TableCell colSpan={12} className="text-center text-gray-500 py-8">
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
