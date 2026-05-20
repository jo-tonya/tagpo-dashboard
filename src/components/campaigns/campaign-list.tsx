'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Campaign, getBillingMonth } from '@/lib/types'
import {
  calcUserRewardAmount,
  calcCampaignProfit,
  calcRevenue,
  formatCurrency,
  formatMonth,
} from '@/lib/calculations'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  costMaps?: CostMaps  // §12-2: 合計費用・粗利を計算するための一括取得済み集計
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

// §12-3: 5値の確度色
const CERTAINTY_LIST = ['A.完了', 'B.進行中', 'C.受注確定', 'D.見込み+', 'E.見込み-'] as const
const CERTAINTY_COLORS: Record<string, string> = {
  'A.完了':      'text-green-700',
  'B.進行中':    'text-blue-700',
  'C.受注確定':  'text-indigo-700',
  'D.見込み+':   'text-yellow-700',
  'E.見込み-':   'text-gray-600',
  // 旧値の後方互換（migration 前 / フェールセーフ）
  '確定':       'text-green-700',
  '見込み':     'text-blue-700',
  '未確定':     'text-yellow-700',
}

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>メーカー</TableHead>
              <TableHead>案件名</TableHead>
              <TableHead className="text-right">請求月（再生完了月）</TableHead>
              <TableHead className="text-right">予算</TableHead>
              <TableHead className="text-right">請求金額</TableHead>
              <TableHead className="text-right">合計費用</TableHead>
              <TableHead className="text-right">粗利</TableHead>
              <TableHead className="text-right">ユーザー報酬額</TableHead>
              <TableHead className="text-center">ステータス</TableHead>
              <TableHead className="text-center">確度</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => {
              const rewardAmount = calcUserRewardAmount(
                campaign.user_reward_amount,
                campaign.budget,
                campaign.unit_price,
                campaign.user_reward_unit_price
              )
              const isManual = campaign.user_reward_amount != null && campaign.user_reward_amount > 0
              // 請求金額（実請求額）= 予算 × (1 - 小売マージン - 代理店マージン)
              const invoiceAmount = campaign.budget != null && campaign.budget > 0
                ? Math.round(calcRevenue(
                    campaign.budget,
                    campaign.retail_margin ?? 0,
                    campaign.agency_margin ?? 0,
                  ))
                : null

              // §12-2: 案件単位の試算ベース（calcCampaignProfit）。
              //   EG 審査費は含まず、posters_count × review_unit_price のみを審査費として加算。
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
                  <TableCell className="text-gray-600">{campaign.maker}</TableCell>
                  <TableCell>
                    <Link href={`/campaigns/${campaign.id}`} className="text-blue-600 hover:underline">
                      {campaign.product}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatMonth(getBillingMonth(campaign))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(campaign.budget)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(invoiceAmount)}</TableCell>
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
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-gray-500 py-8">
                  案件がありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
