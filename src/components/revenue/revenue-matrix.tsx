'use client'

import Link from 'next/link'
import { Campaign, campaignDisplayName, getBillingMonth } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/calculations'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CertaintyFilterBar, useCertaintyFilter } from '@/components/shared/certainty-filter'

interface RevenueMatrixProps {
  campaigns: Campaign[]
}

// 2025/11 ~ 2026/12 の月リスト
const MONTHS = [
  '2025-11-01', '2025-12-01',
  '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
  '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01',
  '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01',
]

export function RevenueMatrix({ campaigns }: RevenueMatrixProps) {
  // 確度フィルタ（初期は失注以外）
  const certaintyFilter = useCertaintyFilter()

  // billing_amount があり、かつ選択中の確度に該当するキャンペーンのみ
  const withBilling = campaigns.filter(
    c => c.billing_amount != null && c.billing_amount > 0 && certaintyFilter.matches(c.certainty),
  )

  // 月ごとの合計を事前計算
  const monthlyTotals: Record<string, number> = {}
  for (const month of MONTHS) {
    monthlyTotals[month] = withBilling
      .filter(c => getBillingMonth(c) === month)
      .reduce((sum, c) => sum + (c.billing_amount ?? 0), 0)
  }

  // 全期間の総合計
  const grandTotal = Object.values(monthlyTotals).reduce((sum, v) => sum + v, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base whitespace-nowrap">月次×案件 収入マトリクス</CardTitle>
          <CertaintyFilterBar filter={certaintyFilter} />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-white min-w-[200px]">
                案件
              </TableHead>
              {MONTHS.map((month) => (
                <TableHead key={month} className="text-right min-w-[100px] text-xs">
                  {formatMonth(month)}
                </TableHead>
              ))}
              <TableHead className="text-right min-w-[110px] font-bold bg-blue-50 text-xs">
                合計
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withBilling.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell className="sticky left-0 z-10 bg-white text-sm font-medium">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {campaignDisplayName(campaign)}
                  </Link>
                </TableCell>
                {MONTHS.map((month) => {
                  const amount =
                    getBillingMonth(campaign) === month ? campaign.billing_amount : null
                  return (
                    <TableCell key={month} className="text-right text-sm tabular-nums">
                      {amount != null && amount > 0 ? formatCurrency(amount) : '—'}
                    </TableCell>
                  )
                })}
                <TableCell className="text-right text-sm tabular-nums font-semibold bg-blue-50">
                  {(campaign.billing_amount ?? 0) > 0
                    ? formatCurrency(campaign.billing_amount)
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
            {withBilling.length === 0 && (
              <TableRow>
                <TableCell colSpan={MONTHS.length + 2} className="text-center text-gray-500 py-8">
                  請求データがありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="border-t-2 font-bold">
              <TableCell className="sticky left-0 z-10 bg-muted/50 text-sm">
                月計
              </TableCell>
              {MONTHS.map((month) => (
                <TableCell key={month} className="text-right text-sm tabular-nums">
                  {monthlyTotals[month] > 0
                    ? formatCurrency(monthlyTotals[month])
                    : '—'}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm tabular-nums bg-blue-50">
                {formatCurrency(grandTotal)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  )
}
