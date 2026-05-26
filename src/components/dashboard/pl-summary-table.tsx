'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown, Download } from 'lucide-react'
import { MonthlyPL, RevenueDetail, CostDetail } from '@/lib/types'
import { CostStatusDetail } from '@/lib/data/dashboard'
import { formatCurrency, formatMonth, formatPercent } from '@/lib/calculations'
import { rowsToCsv, downloadCsv } from '@/lib/csv'
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

// §14: 確度 5 値マルチセレクト
const ALL_CERTAINTY = ['A.完了', 'B.進行中', 'C.受注確定', 'D.見込み+', 'E.見込み-'] as const
type Certainty = typeof ALL_CERTAINTY[number]

// 旧文字列（'確定'/'見込み'/'未確定'）を 5 値へ正規化。不明値は null（PL から除外）
function normalizeCertainty(raw: string): Certainty | null {
  if ((ALL_CERTAINTY as readonly string[]).includes(raw)) return raw as Certainty
  if (raw === '確定') return 'A.完了'
  if (raw === '見込み') return 'B.進行中'
  if (raw === '未確定') return 'D.見込み+'
  return null
}

// ボタン選択時の色（確度別）
const CERTAINTY_BTN_COLOR: Record<Certainty, string> = {
  'A.完了':    'bg-emerald-600 hover:bg-emerald-700',
  'B.進行中':  'bg-blue-600 hover:bg-blue-700',
  'C.受注確定': 'bg-violet-600 hover:bg-violet-700',
  'D.見込み+': 'bg-amber-500 hover:bg-amber-600',
  'E.見込み-': 'bg-zinc-400 hover:bg-zinc-500',
}

export function PLSummaryTable({ data, revenueDetails, costDetails, costStatusDetails }: PLSummaryTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // §14: 確度 5 値マルチセレクト。初期は全選択（＝従来の「全体」と同じ集計）
  const [certaintySet, setCertaintySet] = useState<Set<Certainty>>(() => new Set(ALL_CERTAINTY))

  const isAllSelected = certaintySet.size === ALL_CERTAINTY.length
  const isNoneSelected = certaintySet.size === 0

  function toggleCertainty(c: Certainty) {
    setCertaintySet(prev => {
      const next = new Set(prev)
      if (next.has(c)) { next.delete(c) } else { next.add(c) }
      return next
    })
  }

  // 案件確度（campaigns.certainty）が選択集合に含まれるか
  const matchesFilter = useMemo(() => {
    return (raw: string): boolean => {
      const c = normalizeCertainty(raw)
      return c !== null && certaintySet.has(c)
    }
  }, [certaintySet])

  // 案件売上は確度フィルタ対象
  const filteredRevenueDetails = useMemo(() => {
    return revenueDetails.filter(rd => matchesFilter(rd.certainty))
  }, [revenueDetails, matchesFilter])

  // §14: 確度フィルタを反映して再集計。
  //   ・案件由来コスト（user_reward / product / subcontract / ad_delivery / misc / agency_fee）
  //     … campaigns.certainty でフィルタ
  //   ・fixed_costs 由来（review = EG審査実費 / eg_admin = EG管理費）と personnel
  //     … 確度を持たないので常に全額計上（view の値そのまま）
  const adjustedData = useMemo(() => {
    const revByMonth: Record<string, number> = {}
    filteredRevenueDetails.forEach(rd => {
      revByMonth[rd.month] = (revByMonth[rd.month] || 0) + rd.billing_amount
    })

    const sumBySource = (src: CostStatusDetail['source']): Record<string, number> => {
      const out: Record<string, number> = {}
      costStatusDetails
        .filter(c => c.source === src && matchesFilter(c.status))
        .forEach(c => {
          out[c.target_month] = (out[c.target_month] || 0) + c.amount
        })
      return out
    }

    // 確度フィルタ対象（campaigns 由来）
    const ur = sumBySource('user_reward')
    const product = sumBySource('product')
    const sub = sumBySource('subcontract')
    const ad = sumBySource('ad_delivery')
    const misc = sumBySource('misc')
    const agency = sumBySource('agency_fee')

    return data.map(d => {
      const revenue = revByMonth[d.month] || 0
      const userReward = ur[d.month] || 0
      const productCost = product[d.month] || 0
      const subcontract = sub[d.month] || 0
      const adDelivery = ad[d.month] || 0
      const miscCost = misc[d.month] || 0
      const agencyFee = agency[d.month] || 0
      // フィルタ非対象（fixed_costs / personnel）は view 値をそのまま使う
      const reviewCost = d.review_cost
      const egAdminCost = d.eg_admin_cost
      const personnelCost = d.personnel_cost
      const eGuardian = reviewCost + egAdminCost  // 補足: 審査費+管理費 合計
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
  }, [data, filteredRevenueDetails, costStatusDetails, matchesFilter])

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

  // §14: 選択集合をファイル名用ラベルに（A〜E の先頭1文字を連結）
  function certaintyLabel(): string {
    if (isAllSelected) return '全件'
    if (isNoneSelected) return '空'
    return ALL_CERTAINTY.filter(c => certaintySet.has(c)).map(c => c.charAt(0)).join('')
  }

  // §13/§14: 現在表示中の PL を CSV としてダウンロード
  function handleExportCsv() {
    const months = adjustedData.map(d => formatMonth(d.month))
    const headers = ['項目', ...months, '2025年計', '2026年計']
    const dataRows: (string | number)[][] = [headers]

    const pushRow = (
      label: string,
      accessor: (d: typeof adjustedData[number]) => number,
      formatFn: (v: number) => string = formatCurrency,
    ) => {
      const cells: (string | number)[] = [label]
      adjustedData.forEach(d => cells.push(formatFn(accessor(d))))
      cells.push(formatFn(data2025.reduce((s, d) => s + accessor(d), 0)))
      cells.push(formatFn(data2026.reduce((s, d) => s + accessor(d), 0)))
      dataRows.push(cells)
    }
    const pushRate = (
      label: string,
      accessor: (d: typeof adjustedData[number]) => number,  // 0〜1
      yearRate: (rows: typeof data2025) => number,
    ) => {
      const cells: (string | number)[] = [label]
      adjustedData.forEach(d => cells.push(formatPercent(accessor(d))))
      cells.push(formatPercent(yearRate(data2025)))
      cells.push(formatPercent(yearRate(data2026)))
      dataRows.push(cells)
    }

    // 売上
    pushRow('案件収益', d => d.revenue)
    // 原価
    pushRow('審査費', d => d.review_cost)
    pushRow('ユーザー報酬', d => d.user_reward_cost)
    pushRow('商品代', d => d.product_cost)
    pushRow('外注費', d => d.subcontract_cost)
    pushRow('広告配信費', d => d.ad_delivery_cost)
    pushRow('その他諸経費', d => d.misc_cost)
    pushRow('原価合計', d => d.cogs_total)
    pushRow('粗利', d => d.revenue - d.cogs_total)
    pushRate('粗利率',
      d => d.revenue > 0 ? (d.revenue - d.cogs_total) / d.revenue : 0,
      rows => {
        const rev = sumByKey(rows, 'revenue')
        return rev > 0 ? (rev - sumByKey(rows, 'cogs_total')) / rev : 0
      })
    // 販管費
    pushRow('EG管理費', d => d.eg_admin_cost)
    pushRow('営業代理店フィー', d => d.agency_fee_cost)
    pushRow('アルバイト・イベント・インターン', d => d.personnel_cost)
    pushRow('販管費合計', d => d.sga_total)
    // 合計
    pushRow('コスト合計', d => d.cogs_total + d.sga_total)
    pushRow('営業利益', d => d.operating_profit)
    pushRate('営業利益率',
      d => d.revenue > 0 ? d.operating_profit / d.revenue : 0,
      rows => {
        const rev = sumByKey(rows, 'revenue')
        return rev > 0 ? sumByKey(rows, 'operating_profit') / rev : 0
      })

    const csv = rowsToCsv(dataRows)
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`月次PL_${certaintyLabel()}_${today}.csv`, csv)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-lg whitespace-nowrap">月次PL</CardTitle>
            <div className="flex gap-1.5 flex-wrap">
              {ALL_CERTAINTY.map(c => {
                const active = certaintySet.has(c)
                return (
                  <Button
                    key={c}
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className={active ? CERTAINTY_BTN_COLOR[c] : ''}
                    onClick={() => toggleCertainty(c)}
                  >
                    {c}
                  </Button>
                )
              })}
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCertaintySet(new Set(ALL_CERTAINTY))}
                disabled={isAllSelected}
              >
                全選択
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCertaintySet(new Set())}
                disabled={isNoneSelected}
              >
                クリア
              </Button>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
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
