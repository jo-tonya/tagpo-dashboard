'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { MonthlyPL, RevenueDetail, CostDetail } from '@/lib/types'
import { CostStatusDetail } from '@/lib/data/dashboard'
import { formatCurrency, formatMonth } from '@/lib/calculations'
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

export function PLSummaryTable({ data, revenueDetails, costDetails, costStatusDetails }: PLSummaryTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'all' | 'confirmed'>('all')

  // Filter revenue details by certainty
  const filteredRevenueDetails = useMemo(() => {
    if (viewMode === 'all') return revenueDetails
    return revenueDetails.filter(rd => rd.certainty === '確定')
  }, [revenueDetails, viewMode])

  // Inject user_reward_cost from costStatusDetails and split from project_cost
  const dataWithReward = useMemo(() => {
    const rewardByMonth: Record<string, number> = {}
    costStatusDetails
      .filter(c => c.source === 'user_reward')
      .forEach(c => {
        rewardByMonth[c.target_month] = (rewardByMonth[c.target_month] || 0) + c.amount
      })
    return data.map(d => {
      const userRewardCost = rewardByMonth[d.month] || 0
      return {
        ...d,
        user_reward_cost: userRewardCost,
        project_cost: d.project_cost - userRewardCost, // remove user_reward from project_cost to avoid double counting
      }
    })
  }, [data, costStatusDetails])

  // Adjust PL data when in confirmed mode
  const adjustedData = useMemo(() => {
    if (viewMode === 'all') return dataWithReward

    const confirmedRevByMonth: Record<string, number> = {}
    filteredRevenueDetails.forEach(rd => {
      confirmedRevByMonth[rd.month] = (confirmedRevByMonth[rd.month] || 0) + rd.billing_amount
    })

    const confirmedEgByMonth: Record<string, number> = {}
    costStatusDetails
      .filter(c => c.source === 'e_guardian' && c.status === '確定')
      .forEach(c => {
        confirmedEgByMonth[c.target_month] = (confirmedEgByMonth[c.target_month] || 0) + c.amount
      })

    const confirmedPersonnelByMonth: Record<string, number> = {}
    costStatusDetails
      .filter(c => c.source === 'personnel' && c.status === '確定')
      .forEach(c => {
        confirmedPersonnelByMonth[c.target_month] = (confirmedPersonnelByMonth[c.target_month] || 0) + c.amount
      })

    const confirmedRewardByMonth: Record<string, number> = {}
    costStatusDetails
      .filter(c => c.source === 'user_reward' && c.status === '確定')
      .forEach(c => {
        confirmedRewardByMonth[c.target_month] = (confirmedRewardByMonth[c.target_month] || 0) + c.amount
      })

    return dataWithReward.map(d => {
      const revenue = confirmedRevByMonth[d.month] || 0
      const egCost = confirmedEgByMonth[d.month] || 0
      const personnelCost = confirmedPersonnelByMonth[d.month] || 0
      const userRewardCost = confirmedRewardByMonth[d.month] || 0
      const projectCost = d.project_cost
      const totalCost = egCost + personnelCost + userRewardCost + projectCost
      return {
        ...d,
        revenue,
        e_guardian_cost: egCost,
        personnel_cost: personnelCost,
        user_reward_cost: userRewardCost,
        project_cost: projectCost,
        total_cost: totalCost,
        operating_profit: revenue - totalCost,
      }
    })
  }, [dataWithReward, filteredRevenueDetails, costStatusDetails, viewMode])

  const data2025 = adjustedData.filter(d => d.month.startsWith('2025'))
  const data2026 = adjustedData.filter(d => d.month.startsWith('2026'))

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  function cellClass(key: PLKey, value: number): string {
    if (key !== 'operating_profit') return ''
    if (value < 0) return 'text-red-600 font-bold'
    if (value > 0) return 'text-green-700 font-bold'
    return ''
  }

  // Revenue details grouped by project
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

  // 「案件コスト（原価）」行の内訳からユーザー報酬（tonya_user_payment）を除外する。
  // ユーザー報酬は独立した行として既に表示されており、dataWithReward 側で
  // project_cost から減算済みのため、内訳にも残すとダブルカウント表示になる。
  const projectCostDetails = costDetails.filter(cd => cd.cost_type !== 'tonya_user_payment')

  // Cost details grouped by project + cost_label
  const costByProjectLabel = projectCostDetails.reduce<Record<string, CostDetail[]>>((acc, cd) => {
    const key = `${cd.campaign_id}::${cd.cost_label}`
    if (!acc[key]) acc[key] = []
    acc[key].push(cd)
    return acc
  }, {})

  const costGroups = Object.entries(costByProjectLabel)
    .map(([compositeKey, details]) => ({
      compositeKey,
      projectId: details[0].campaign_id,
      displayName: details[0].display_name,
      costLabel: details[0].cost_label,
      details,
      earliestMonth: details.reduce((min, d) => d.month < min ? d.month : min, details[0].month),
    }))
    .sort((a, b) => a.earliestMonth.localeCompare(b.earliestMonth))

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
  const isCostExpanded = expanded.has('project_cost')

  const expandableRows: { key: string; label: string; plKey: PLKey; className: string }[] = [
    { key: 'e_guardian_cost', label: 'イー・ガーディアン', plKey: 'e_guardian_cost', className: 'text-gray-600' },
    { key: 'personnel_cost', label: 'アルバイト・イベント・インターン', plKey: 'personnel_cost', className: 'text-gray-600' },
    { key: 'user_reward_cost', label: 'ユーザー報酬', plKey: 'user_reward_cost', className: 'text-gray-600' },
    { key: 'project_cost', label: '案件コスト（原価）', plKey: 'project_cost', className: 'text-gray-600' },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <CardTitle className="text-lg">月次PLサマリー</CardTitle>
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

            {/* 案件収益 (expandable) */}
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

            {/* 案件収益 expanded rows */}
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

            {/* コスト各行 */}
            {expandableRows.map(row => {
              const isExpandable = row.key === 'project_cost'
              const isRowExpanded = isExpandable && isCostExpanded

              return (
                <React.Fragment key={row.key}>
                  <TableRow
                    className={isExpandable ? 'cursor-pointer hover:bg-gray-100 transition-all duration-200' : ''}
                    onClick={isExpandable ? () => toggleExpand('project_cost') : undefined}
                  >
                    <TableCell className={`sticky left-0 z-10 bg-white text-sm pl-6 ${row.className}`}>
                      {isExpandable ? (
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

                  {/* 案件コスト expanded rows */}
                  {isRowExpanded && costGroups.map(({ compositeKey, projectId, displayName, costLabel, details }) => (
                    <TableRow key={`cost-${compositeKey}`} className="bg-gray-50 transition-all duration-200">
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
            })}

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

            {/* 事業利益 */}
            <TableRow className="border-t-2 bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-sm font-bold">
                事業利益
              </TableCell>
              {adjustedData.map(d => (
                <TableCell key={d.month} className={`text-right text-sm tabular-nums ${cellClass('operating_profit', d.operating_profit)}`}>
                  {d.operating_profit === 0 ? '—' : formatCurrency(d.operating_profit)}
                </TableCell>
              ))}
              <TableCell className={`text-right text-sm tabular-nums font-bold bg-blue-50 ${cellClass('operating_profit', sumByKey(data2025, 'operating_profit'))}`}>
                {formatCurrency(sumByKey(data2025, 'operating_profit'))}
              </TableCell>
              <TableCell className={`text-right text-sm tabular-nums font-bold bg-blue-50 ${cellClass('operating_profit', sumByKey(data2026, 'operating_profit'))}`}>
                {formatCurrency(sumByKey(data2026, 'operating_profit'))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
