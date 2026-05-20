'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { MonthlyPL, RevenueDetail, CostDetail } from '@/lib/types'
import { CostStatusDetail } from '@/lib/data/dashboard'
import { formatCurrency, formatMonth, formatPercent } from '@/lib/calculations'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface PLSummaryTableProps {
  data: MonthlyPL[]
  revenueDetails: RevenueDetail[]
  costDetails: CostDetail[]
  costStatusDetails: CostStatusDetail[]
}

type PLKey = keyof Omit<MonthlyPL, 'month'>

function sumByKey(data: MonthlyPL[], key: PLKey): number {
  return data.reduce((sum, d) => sum + d[key], 0)
}

type CostRow = {
  key: string
  label: string
  plKey: PLKey
  expandable: boolean
  costTypes?: string[]
}

// 案件コスト（原価, COGS）— 6項目（§12-1 で商品代復活）
//   ※ 審査費は §11→§12-5 で EG ページの「審査（実費入力）」のみベース。
//      campaign_costs 由来ではないため案件別内訳は出せない（expandable: false）。
const COGS_ROWS: CostRow[] = [
  { key: 'review_cost',      label: '審査費',       plKey: 'review_cost',      expandable: false },
  { key: 'user_reward_cost', label: 'ユーザー報酬',  plKey: 'user_reward_cost', expandable: true, costTypes: ['tonya_user_payment'] },
  { key: 'product_cost',     label: '商品代',       plKey: 'product_cost',     expandable: true, costTypes: ['product_cost'] },
  { key: 'subcontract_cost', label: '外注費',       plKey: 'subcontract_cost', expandable: true, costTypes: ['subcontract_1', 'subcontract_2', 'subcontract_3'] },
  { key: 'ad_delivery_cost', label: '広告配信費',    plKey: 'ad_delivery_cost', expandable: true, costTypes: ['ad_delivery'] },
  { key: 'misc_cost',        label: 'その他諸経費',  plKey: 'misc_cost',        expandable: true, costTypes: ['misc'] },
]

// 販管費（SG&A, 非案件コスト）— 3項目（§12-5 で EG管理費を再分離）
const SGA_ROWS: CostRow[] = [
  { key: 'eg_admin_cost',   label: 'EG管理費',                          plKey: 'eg_admin_cost',   expandable: false },
  { key: 'agency_fee_cost', label: '営業代理店フィー',                    plKey: 'agency_fee_cost', expandable: false },
  { key: 'personnel_cost',  label: 'アルバイト・イベント・インターン',     plKey: 'personnel_cost',  expandable: false },
]

// §12-3: 「確定」扱いの certainty 値（A.完了 / C.受注確定）
function isConfirmedStatus(status: string): boolean {
  return status === 'A.完了' || status === 'C.受注確定'
       // 後方互換: migration 前データ
       || status === '確定'
}

export function PLSummaryTable({ data, revenueDetails, costDetails, costStatusDetails }: PLSummaryTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'all' | 'confirmed'>('all')

  const filteredRevenueDetails = useMemo(() => {
    if (viewMode === 'all') return revenueDetails
    return revenueDetails.filter(rd => isConfirmedStatus(rd.certainty))
  }, [revenueDetails, viewMode])

  // 確定モード: costStatusDetails の 'confirmed' のみで再集計
  const adjustedData = useMemo(() => {
    if (viewMode === 'all') return data

    const confirmedRevByMonth: Record<string, number> = {}
    filteredRevenueDetails.forEach(rd => {
      confirmedRevByMonth[rd.month] = (confirmedRevByMonth[rd.month] || 0) + rd.billing_amount
    })

    // fixed_costs / personnel_payments の status は旧 '確定' 文字列のまま
    // campaigns.certainty は §12-3 で A.完了/C.受注確定 に移行済み
    const isConfirmed = (status: string) =>
      isConfirmedStatus(status) || status === '確定'

    const sumBySource = (src: CostStatusDetail['source']): Record<string, number> => {
      const out: Record<string, number> = {}
      costStatusDetails
        .filter(c => c.source === src && isConfirmed(c.status))
        .forEach(c => {
          out[c.target_month] = (out[c.target_month] || 0) + c.amount
        })
      return out
    }

    const personnel = sumBySource('personnel')
    const ur = sumBySource('user_reward')
    const sub = sumBySource('subcontract')
    const ad = sumBySource('ad_delivery')
    const review = sumBySource('review')        // §12-5: EG「審査（実費入力）」のみ
    const egAdmin = sumBySource('eg_admin')      // §12-5: EG「管理費」
    const product = sumBySource('product')       // §12-1 復活: 商品代
    const misc = sumBySource('misc')
    const agency = sumBySource('agency_fee')

    return data.map(d => {
      const revenue = confirmedRevByMonth[d.month] || 0
      const reviewCost = review[d.month] || 0
      const userReward = ur[d.month] || 0
      const productCost = product[d.month] || 0
      const subcontract = sub[d.month] || 0
      const adDelivery = ad[d.month] || 0
      const miscCost = misc[d.month] || 0
      const personnelCost = personnel[d.month] || 0
      const egAdminCost = egAdmin[d.month] || 0
      const eGuardian = reviewCost + egAdminCost  // 補足: 審査費+管理費 合計
      const agencyFee = agency[d.month] || 0
      const cogsTotal = reviewCost + userReward + productCost + subcontract + adDelivery + miscCost
      const sgaTotal = egAdminCost + agencyFee + personnelCost
      const totalCost = cogsTotal + sgaTotal
      return {
        ...d,
        revenue,
        review_cost: reviewCost,
        user_reward_cost: userReward,
        product_cost: productCost,
        subcontract_cost: subcontract,
        ad_delivery_cost: adDelivery,
        misc_cost: miscCost,
        eg_admin_cost: egAdminCost,
        agency_fee_cost: agencyFee,
        personnel_cost: personnelCost,
        e_guardian_cost: eGuardian,
        cogs_total: cogsTotal,
        sga_total: sgaTotal,
        total_cost: totalCost,
        operating_profit: revenue - totalCost,
      }
    })
  }, [data, filteredRevenueDetails, costStatusDetails, viewMode])

  const data2025 = adjustedData.filter(d => d.month.startsWith('2025'))
  const data2026 = adjustedData.filter(d => d.month.startsWith('2026'))

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  function profitClass(value: number): string {
    if (value < 0) return 'text-red-600 font-bold'
    if (value > 0) return 'text-green-700 font-bold'
    return ''
  }

  const revenueByProject = filteredRevenueDetails.reduce<Record<string, RevenueDetail[]>>((acc, rd) => {
    const key = rd.campaign_id
    if (!acc[key]) acc[key] = []
    acc[key].push(rd)
    return acc
  }, {})

  const revenueProjects = Object.entries(revenueByProject)
    .map(([projectId, details]) => ({
      projectId,
      displayName: details[0].display_name,
      details,
      earliestMonth: details.reduce((min, d) => d.month < min ? d.month : min, details[0].month),
    }))
    .sort((a, b) => a.earliestMonth.localeCompare(b.earliestMonth))

  function buildCostGroups(costTypes: string[]) {
    const filtered = costDetails.filter(cd => costTypes.includes(cd.cost_type))
    const byKey = filtered.reduce<Record<string, CostDetail[]>>((acc, cd) => {
      const key = `${cd.campaign_id}::${cd.cost_label}`
      if (!acc[key]) acc[key] = []
      acc[key].push(cd)
      return acc
    }, {})
    return Object.entries(byKey)
      .map(([compositeKey, details]) => ({
        compositeKey,
        projectId: details[0].campaign_id,
        displayName: details[0].display_name,
        costLabel: details[0].cost_label,
        details,
        earliestMonth: details.reduce((min, d) => d.month < min ? d.month : min, details[0].month),
      }))
      .sort((a, b) => a.earliestMonth.localeCompare(b.earliestMonth))
  }

  function getMonthValue(details: { month: string; billing_amount?: number; amount?: number }[], month: string): number {
    const found = details.find(d => d.month === month)
    if (!found) return 0
    return ('billing_amount' in found ? found.billing_amount : found.amount) as number ?? 0
  }

  function sumDetails(details: { month: string; billing_amount?: number; amount?: number }[], yearPrefix: string): number {
    return details
      .filter(d => d.month.startsWith(yearPrefix))
      .reduce((sum, d) => sum + (('billing_amount' in d ? d.billing_amount : d.amount) as number ?? 0), 0)
  }

  const isRevenueExpanded = expanded.has('revenue')

  function renderCostRow(row: CostRow) {
    const isRowExpanded = row.expandable && expanded.has(row.key)
    const groups = isRowExpanded && row.costTypes ? buildCostGroups(row.costTypes) : []

    return (
      <React.Fragment key={row.key}>
        <TableRow
          className={row.expandable ? 'cursor-pointer hover:bg-gray-100 transition-all duration-200' : ''}
          onClick={row.expandable ? () => toggleExpand(row.key) : undefined}
        >
          <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-gray-600">
            {row.expandable ? (
              <span className="inline-flex items-center gap-1">
                {isRowExpanded
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />}
                {row.label}
              </span>
            ) : (
              row.label
            )}
          </TableCell>
          {adjustedData.map(d => (
            <TableCell key={d.month} className="text-right text-sm tabular-nums">
              {d[row.plKey] === 0 ? '—' : formatCurrency(d[row.plKey])}
            </TableCell>
          ))}
          <TableCell className="text-right text-sm tabular-nums bg-blue-50">
            {formatCurrency(sumByKey(data2025, row.plKey))}
          </TableCell>
          <TableCell className="text-right text-sm tabular-nums bg-blue-50">
            {formatCurrency(sumByKey(data2026, row.plKey))}
          </TableCell>
        </TableRow>

        {isRowExpanded && groups.map(({ compositeKey, projectId, displayName, costLabel, details }) => (
          <TableRow key={`cost-${row.key}-${compositeKey}`} className="bg-gray-50 transition-all duration-200">
            <TableCell className="sticky left-0 z-10 bg-gray-50 text-sm pl-8 text-gray-600">
              <Link href={`/campaigns/${projectId}`} className="text-blue-600 hover:underline">
                {displayName}
              </Link>
              <span className="text-gray-400 ml-1 text-xs">({costLabel})</span>
            </TableCell>
            {adjustedData.map(d => {
              const val = getMonthValue(details.map(x => ({ month: x.month, amount: x.amount })), d.month)
              return (
                <TableCell key={d.month} className="text-right text-sm tabular-nums text-gray-600">
                  {val === 0 ? '—' : formatCurrency(val)}
                </TableCell>
              )
            })}
            <TableCell className="text-right text-sm tabular-nums bg-blue-50 text-gray-600">
              {formatCurrency(sumDetails(details.map(x => ({ month: x.month, amount: x.amount })), '2025'))}
            </TableCell>
            <TableCell className="text-right text-sm tabular-nums bg-blue-50 text-gray-600">
              {formatCurrency(sumDetails(details.map(x => ({ month: x.month, amount: x.amount })), '2026'))}
            </TableCell>
          </TableRow>
        ))}
      </React.Fragment>
    )
  }

  // 粗利率（行ごと）
  const grossMarginByMonth: Record<string, number> = {}
  for (const d of adjustedData) {
    grossMarginByMonth[d.month] = d.revenue > 0 ? (d.revenue - d.cogs_total) / d.revenue : 0
  }
  const grossMargin2025 = sumByKey(data2025, 'revenue') > 0
    ? (sumByKey(data2025, 'revenue') - sumByKey(data2025, 'cogs_total')) / sumByKey(data2025, 'revenue') : 0
  const grossMargin2026 = sumByKey(data2026, 'revenue') > 0
    ? (sumByKey(data2026, 'revenue') - sumByKey(data2026, 'cogs_total')) / sumByKey(data2026, 'revenue') : 0

  const operatingMargin2025 = sumByKey(data2025, 'revenue') > 0
    ? sumByKey(data2025, 'operating_profit') / sumByKey(data2025, 'revenue') : 0
  const operatingMargin2026 = sumByKey(data2026, 'revenue') > 0
    ? sumByKey(data2026, 'operating_profit') / sumByKey(data2026, 'revenue') : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <CardTitle className="text-lg">月次PL</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('all')}
            >
              全体（見込み含む）
            </Button>
            <Button
              variant={viewMode === 'confirmed' ? 'default' : 'outline'}
              size="sm"
              className={viewMode === 'confirmed' ? 'bg-green-600 hover:bg-green-700' : ''}
              onClick={() => setViewMode('confirmed')}
            >
              確定のみ
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-white min-w-[180px]">項目</TableHead>
              {adjustedData.map((d) => (
                <TableHead key={d.month} className="text-right min-w-[90px] text-xs">
                  {formatMonth(d.month)}
                </TableHead>
              ))}
              <TableHead className="text-right min-w-[100px] font-bold bg-blue-50 text-xs">2025年計</TableHead>
              <TableHead className="text-right min-w-[100px] font-bold bg-blue-50 text-xs">2026年計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* 売上ヘッダー */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs font-medium text-gray-500" colSpan={1}>
                売上高
              </TableCell>
              {adjustedData.map(d => <TableCell key={d.month} />)}
              <TableCell className="bg-blue-50" />
              <TableCell className="bg-blue-50" />
            </TableRow>

            <TableRow
              className="cursor-pointer hover:bg-gray-100 transition-all duration-200"
              onClick={() => toggleExpand('revenue')}
            >
              <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 font-semibold text-blue-700">
                <span className="inline-flex items-center gap-1">
                  {isRevenueExpanded
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                  案件収益
                </span>
              </TableCell>
              {adjustedData.map(d => (
                <TableCell key={d.month} className="text-right text-sm tabular-nums">
                  {d.revenue === 0 ? '—' : formatCurrency(d.revenue)}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2025, 'revenue'))}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2026, 'revenue'))}
              </TableCell>
            </TableRow>

            {isRevenueExpanded && revenueProjects.map(({ projectId, displayName, details }) => (
              <TableRow key={`rev-${projectId}`} className="bg-gray-50 transition-all duration-200">
                <TableCell className="sticky left-0 z-10 bg-gray-50 text-sm pl-8 text-gray-600">
                  <Link href={`/campaigns/${projectId}`} className="text-blue-600 hover:underline">
                    {displayName}
                  </Link>
                </TableCell>
                {adjustedData.map(d => {
                  const val = getMonthValue(details.map(x => ({ month: x.month, billing_amount: x.billing_amount })), d.month)
                  return (
                    <TableCell key={d.month} className="text-right text-sm tabular-nums text-gray-600">
                      {val === 0 ? '—' : formatCurrency(val)}
                    </TableCell>
                  )
                })}
                <TableCell className="text-right text-sm tabular-nums bg-blue-50 text-gray-600">
                  {formatCurrency(sumDetails(details.map(x => ({ month: x.month, billing_amount: x.billing_amount })), '2025'))}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums bg-blue-50 text-gray-600">
                  {formatCurrency(sumDetails(details.map(x => ({ month: x.month, billing_amount: x.billing_amount })), '2026'))}
                </TableCell>
              </TableRow>
            ))}

            {/* 出金ヘッダー */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs font-medium text-gray-500" colSpan={1}>
                出金（請求ベース）
              </TableCell>
              {adjustedData.map(d => <TableCell key={d.month} />)}
              <TableCell className="bg-blue-50" />
              <TableCell className="bg-blue-50" />
            </TableRow>

            {/* 案件コスト（原価）セクション */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs font-medium text-gray-500 pl-4" colSpan={1}>
                【案件コスト（原価）】
              </TableCell>
              {adjustedData.map(d => <TableCell key={d.month} />)}
              <TableCell className="bg-blue-50" />
              <TableCell className="bg-blue-50" />
            </TableRow>
            {COGS_ROWS.map(renderCostRow)}

            {/* 原価合計 */}
            <TableRow className="border-t">
              <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 font-medium text-gray-700">
                原価合計
              </TableCell>
              {adjustedData.map(d => (
                <TableCell key={d.month} className="text-right text-sm tabular-nums font-medium">
                  {d.cogs_total === 0 ? '—' : formatCurrency(d.cogs_total)}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2025, 'cogs_total'))}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2026, 'cogs_total'))}
              </TableCell>
            </TableRow>

            {/* 粗利 */}
            <TableRow>
              <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 font-medium">
                粗利
              </TableCell>
              {adjustedData.map(d => {
                const gp = d.revenue - d.cogs_total
                return (
                  <TableCell key={d.month} className={`text-right text-sm tabular-nums ${profitClass(gp)}`}>
                    {gp === 0 ? '—' : formatCurrency(gp)}
                  </TableCell>
                )
              })}
              <TableCell className={`text-right text-sm tabular-nums font-bold bg-blue-50 ${profitClass(sumByKey(data2025, 'revenue') - sumByKey(data2025, 'cogs_total'))}`}>
                {formatCurrency(sumByKey(data2025, 'revenue') - sumByKey(data2025, 'cogs_total'))}
              </TableCell>
              <TableCell className={`text-right text-sm tabular-nums font-bold bg-blue-50 ${profitClass(sumByKey(data2026, 'revenue') - sumByKey(data2026, 'cogs_total'))}`}>
                {formatCurrency(sumByKey(data2026, 'revenue') - sumByKey(data2026, 'cogs_total'))}
              </TableCell>
            </TableRow>

            {/* 粗利率 */}
            <TableRow>
              <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-gray-600">
                粗利率
              </TableCell>
              {adjustedData.map(d => (
                <TableCell key={d.month} className="text-right text-xs text-gray-600 tabular-nums">
                  {d.revenue > 0 ? formatPercent(grossMarginByMonth[d.month]) : '—'}
                </TableCell>
              ))}
              <TableCell className="text-right text-xs text-gray-600 tabular-nums bg-blue-50">
                {sumByKey(data2025, 'revenue') > 0 ? formatPercent(grossMargin2025) : '—'}
              </TableCell>
              <TableCell className="text-right text-xs text-gray-600 tabular-nums bg-blue-50">
                {sumByKey(data2026, 'revenue') > 0 ? formatPercent(grossMargin2026) : '—'}
              </TableCell>
            </TableRow>

            {/* 販管費（非案件コスト）セクション */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs font-medium text-gray-500 pl-4" colSpan={1}>
                【販管費（非案件コスト）】
              </TableCell>
              {adjustedData.map(d => <TableCell key={d.month} />)}
              <TableCell className="bg-blue-50" />
              <TableCell className="bg-blue-50" />
            </TableRow>
            {SGA_ROWS.map(renderCostRow)}

            {/* 販管費合計 */}
            <TableRow className="border-t">
              <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 font-medium text-gray-700">
                販管費合計
              </TableCell>
              {adjustedData.map(d => (
                <TableCell key={d.month} className="text-right text-sm tabular-nums font-medium">
                  {d.sga_total === 0 ? '—' : formatCurrency(d.sga_total)}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2025, 'sga_total'))}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2026, 'sga_total'))}
              </TableCell>
            </TableRow>

            {/* コスト合計 */}
            <TableRow className="border-t-2">
              <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 font-medium text-gray-700">
                コスト合計
              </TableCell>
              {adjustedData.map(d => (
                <TableCell key={d.month} className="text-right text-sm tabular-nums font-medium">
                  {d.total_cost === 0 ? '—' : formatCurrency(d.total_cost)}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2025, 'total_cost'))}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
                {formatCurrency(sumByKey(data2026, 'total_cost'))}
              </TableCell>
            </TableRow>

            {/* 営業利益（事業利益） */}
            <TableRow className="border-t-2 bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-sm font-bold">
                営業利益
              </TableCell>
              {adjustedData.map(d => (
                <TableCell key={d.month} className={`text-right text-sm tabular-nums ${profitClass(d.operating_profit)}`}>
                  {d.operating_profit === 0 ? '—' : formatCurrency(d.operating_profit)}
                </TableCell>
              ))}
              <TableCell className={`text-right text-sm tabular-nums font-bold bg-blue-50 ${profitClass(sumByKey(data2025, 'operating_profit'))}`}>
                {formatCurrency(sumByKey(data2025, 'operating_profit'))}
              </TableCell>
              <TableCell className={`text-right text-sm tabular-nums font-bold bg-blue-50 ${profitClass(sumByKey(data2026, 'operating_profit'))}`}>
                {formatCurrency(sumByKey(data2026, 'operating_profit'))}
              </TableCell>
            </TableRow>

            {/* 営業利益率 */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-sm pl-6 text-gray-600">
                営業利益率
              </TableCell>
              {adjustedData.map(d => {
                const rate = d.revenue > 0 ? d.operating_profit / d.revenue : 0
                return (
                  <TableCell key={d.month} className="text-right text-xs text-gray-600 tabular-nums">
                    {d.revenue > 0 ? formatPercent(rate) : '—'}
                  </TableCell>
                )
              })}
              <TableCell className="text-right text-xs text-gray-600 tabular-nums bg-blue-50">
                {sumByKey(data2025, 'revenue') > 0 ? formatPercent(operatingMargin2025) : '—'}
              </TableCell>
              <TableCell className="text-right text-xs text-gray-600 tabular-nums bg-blue-50">
                {sumByKey(data2026, 'revenue') > 0 ? formatPercent(operatingMargin2026) : '—'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
