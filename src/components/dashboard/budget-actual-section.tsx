'use client'

import { useMemo } from 'react'
import { MonthlyPL, MonthlyBudget } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface Props {
  monthlyPL: MonthlyPL[]
  budgets: MonthlyBudget[]
}

// 案件コスト = 審査費 + ユーザー報酬 + 外注費 + 広告配信費（※ personnel は販管費なので含めない）
function calcActualGrossProfit(d: MonthlyPL): number {
  return d.revenue - (d.e_guardian_cost + d.user_reward_cost + d.subcontract_cost + d.ad_delivery_cost)
}

function calcBudgetGrossProfit(b: MonthlyBudget): number {
  return Math.round(b.revenue * b.gross_margin_rate)
}

// 月 'YYYY-MM-DD' が属する決算年度（決算月＝11月、年度開始＝12月）
//   2025-12 〜 2026-11 → 2026年度
//   2026-12 〜 2027-11 → 2027年度
function fiscalYearOf(month: string): number {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return m === 12 ? y + 1 : y
}

function formatPercent(actual: number, budget: number): string {
  if (budget <= 0) return '—'
  const pct = (actual / budget) * 100
  return `${pct.toFixed(1)}%`
}

function ratioColor(actual: number, budget: number): string {
  if (budget <= 0) return ''
  const ratio = actual / budget
  if (ratio >= 1.0) return 'text-green-700 font-bold'
  if (ratio >= 0.8) return 'text-yellow-700 font-bold'
  return 'text-red-600 font-bold'
}

const formatYAxis = (value: number) => {
  if (value === 0) return '0'
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`
  return value.toString()
}

export function BudgetActualSection({ monthlyPL, budgets }: Props) {
  // 月をキーに予算と実績をマージ。表示順は monthlyPL の順（昇順）
  const merged = useMemo(() => {
    const budgetByMonth: Record<string, MonthlyBudget> = {}
    for (const b of budgets) budgetByMonth[b.month] = b
    return monthlyPL.map(d => {
      const b = budgetByMonth[d.month]
      const budgetRevenue = b?.revenue ?? 0
      const budgetGross = b ? calcBudgetGrossProfit(b) : 0
      const actualRevenue = d.revenue
      const actualGross = calcActualGrossProfit(d)
      return {
        month: d.month,
        budgetRevenue,
        actualRevenue,
        budgetGross,
        actualGross,
      }
    })
  }, [monthlyPL, budgets])

  // 表示する決算年度（データ範囲から自動判定）。重複なし & 昇順。
  const fiscalYears = useMemo(() => {
    const set = new Set<number>()
    for (const r of merged) set.add(fiscalYearOf(r.month))
    return Array.from(set).sort((a, b) => a - b)
  }, [merged])

  // 年度別合計
  const fiscalSums = useMemo(() => {
    const sums: Record<number, { budgetRevenue: number; actualRevenue: number; budgetGross: number; actualGross: number }> = {}
    for (const fy of fiscalYears) {
      sums[fy] = { budgetRevenue: 0, actualRevenue: 0, budgetGross: 0, actualGross: 0 }
    }
    for (const r of merged) {
      const fy = fiscalYearOf(r.month)
      const s = sums[fy]
      if (!s) continue
      s.budgetRevenue += r.budgetRevenue
      s.actualRevenue += r.actualRevenue
      s.budgetGross += r.budgetGross
      s.actualGross += r.actualGross
    }
    return sums
  }, [merged, fiscalYears])

  const chartData = merged.map(r => ({
    month: formatMonth(r.month),
    売上予算: r.budgetRevenue,
    売上実績: r.actualRevenue,
    粗利予算: r.budgetGross,
    粗利実績: r.actualGross,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">予算 vs 実績（与実）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
              <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`¥${Number(value).toLocaleString('ja-JP')}`, undefined]} />
              <Legend />
              <ReferenceLine y={0} stroke="#666" />
              <Bar dataKey="売上予算" fill="#93C5FD" radius={[2, 2, 0, 0]} />
              <Bar dataKey="売上実績" fill="#2563EB" radius={[2, 2, 0, 0]} />
              <Bar dataKey="粗利予算" fill="#86EFAC" radius={[2, 2, 0, 0]} />
              <Bar dataKey="粗利実績" fill="#16A34A" radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-white min-w-[120px]">項目</TableHead>
                {merged.map(r => (
                  <TableHead key={r.month} className="text-right min-w-[90px] text-xs">
                    {formatMonth(r.month)}
                  </TableHead>
                ))}
                {fiscalYears.map(fy => (
                  <TableHead key={`fy-${fy}`} className="text-right min-w-[110px] font-bold bg-blue-50 text-xs">
                    {fy}年度計
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* 売上予算 */}
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-blue-700 font-medium">売上予算</TableCell>
                {merged.map(r => (
                  <TableCell key={r.month} className="text-right text-sm tabular-nums">
                    {r.budgetRevenue === 0 ? '—' : formatCurrency(r.budgetRevenue)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].budgetRevenue)}
                  </TableCell>
                ))}
              </TableRow>
              {/* 売上実績 */}
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-blue-900 font-medium">売上実績</TableCell>
                {merged.map(r => (
                  <TableCell key={r.month} className="text-right text-sm tabular-nums">
                    {r.actualRevenue === 0 ? '—' : formatCurrency(r.actualRevenue)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].actualRevenue)}
                  </TableCell>
                ))}
              </TableRow>
              {/* 売上達成率 */}
              <TableRow className="border-b-2">
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-gray-600">売上達成率</TableCell>
                {merged.map(r => (
                  <TableCell key={r.month} className={`text-right text-sm tabular-nums ${ratioColor(r.actualRevenue, r.budgetRevenue)}`}>
                    {formatPercent(r.actualRevenue, r.budgetRevenue)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className={`text-right text-sm tabular-nums bg-blue-50 ${ratioColor(fiscalSums[fy].actualRevenue, fiscalSums[fy].budgetRevenue)}`}>
                    {formatPercent(fiscalSums[fy].actualRevenue, fiscalSums[fy].budgetRevenue)}
                  </TableCell>
                ))}
              </TableRow>
              {/* 粗利予算 */}
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-green-700 font-medium">粗利予算</TableCell>
                {merged.map(r => (
                  <TableCell key={r.month} className="text-right text-sm tabular-nums">
                    {r.budgetGross === 0 ? '—' : formatCurrency(r.budgetGross)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].budgetGross)}
                  </TableCell>
                ))}
              </TableRow>
              {/* 粗利実績 */}
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-green-900 font-medium">粗利実績</TableCell>
                {merged.map(r => (
                  <TableCell key={r.month} className="text-right text-sm tabular-nums">
                    {r.actualGross === 0 ? '—' : formatCurrency(r.actualGross)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].actualGross)}
                  </TableCell>
                ))}
              </TableRow>
              {/* 粗利達成率 */}
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-gray-600">粗利達成率</TableCell>
                {merged.map(r => (
                  <TableCell key={r.month} className={`text-right text-sm tabular-nums ${ratioColor(r.actualGross, r.budgetGross)}`}>
                    {formatPercent(r.actualGross, r.budgetGross)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className={`text-right text-sm tabular-nums bg-blue-50 ${ratioColor(fiscalSums[fy].actualGross, fiscalSums[fy].budgetGross)}`}>
                    {formatPercent(fiscalSums[fy].actualGross, fiscalSums[fy].budgetGross)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
