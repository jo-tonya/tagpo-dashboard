'use client'

import { useMemo, useState } from 'react'
import { MonthlyPL, MonthlyBudget } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
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

type ViewMode = 'monthly' | 'quarterly'

// 粗利 = 売上 - 案件コスト合計（cogs_total）。personnel / agency_fee は販管費なので含めない。
function calcActualGrossProfit(d: MonthlyPL): number {
  return d.revenue - d.cogs_total
}

function calcBudgetGrossProfit(b: MonthlyBudget): number {
  return Math.round(b.revenue * b.gross_margin_rate)
}

// 月 'YYYY-MM-DD' が属する決算年度（決算月＝11月、年度開始＝12月）
function fiscalYearOf(month: string): number {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return m === 12 ? y + 1 : y
}

// 月→四半期（FY ベース）
//   Q1: 12,1,2 / Q2: 3,4,5 / Q3: 6,7,8 / Q4: 9,10,11
function fiscalQuarterOf(month: string): { fy: number; q: 1 | 2 | 3 | 4; key: string; label: string } {
  const m = Number(month.slice(5, 7))
  const fy = fiscalYearOf(month)
  let q: 1 | 2 | 3 | 4
  if (m === 12 || m === 1 || m === 2) q = 1
  else if (m >= 3 && m <= 5) q = 2
  else if (m >= 6 && m <= 8) q = 3
  else q = 4
  return { fy, q, key: `${fy}-Q${q}`, label: `FY${fy} Q${q}` }
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

interface Bucket {
  key: string
  label: string
  budgetRevenue: number
  actualRevenue: number
  budgetGross: number
  actualGross: number
}

export function BudgetActualSection({ monthlyPL, budgets }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')

  // 月単位のマージ（基底データ）
  const monthly = useMemo<Bucket[]>(() => {
    const budgetByMonth: Record<string, MonthlyBudget> = {}
    for (const b of budgets) budgetByMonth[b.month] = b
    return monthlyPL.map(d => {
      const b = budgetByMonth[d.month]
      return {
        key: d.month.slice(0, 7),
        label: formatMonth(d.month),
        budgetRevenue: b?.revenue ?? 0,
        actualRevenue: d.revenue,
        budgetGross: b ? calcBudgetGrossProfit(b) : 0,
        actualGross: calcActualGrossProfit(d),
      }
    })
  }, [monthlyPL, budgets])

  // 表示用バケット（モードに応じて月 or 四半期）
  const buckets = useMemo<Bucket[]>(() => {
    if (viewMode === 'monthly') return monthly
    const map = new Map<string, Bucket>()
    // monthlyPL の元 month に基づいて四半期に集約
    for (let i = 0; i < monthlyPL.length; i++) {
      const m = monthly[i]
      const meta = fiscalQuarterOf(monthlyPL[i].month)
      const cur = map.get(meta.key) ?? {
        key: meta.key,
        label: meta.label,
        budgetRevenue: 0,
        actualRevenue: 0,
        budgetGross: 0,
        actualGross: 0,
      }
      cur.budgetRevenue += m.budgetRevenue
      cur.actualRevenue += m.actualRevenue
      cur.budgetGross += m.budgetGross
      cur.actualGross += m.actualGross
      map.set(meta.key, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
  }, [monthly, monthlyPL, viewMode])

  // 表示する決算年度（データ範囲から自動判定）。重複なし & 昇順。
  const fiscalYears = useMemo(() => {
    const set = new Set<number>()
    for (const d of monthlyPL) set.add(fiscalYearOf(d.month))
    return Array.from(set).sort((a, b) => a - b)
  }, [monthlyPL])

  // 年度別合計（月単位データから常に集計）
  const fiscalSums = useMemo(() => {
    const sums: Record<number, { budgetRevenue: number; actualRevenue: number; budgetGross: number; actualGross: number }> = {}
    for (const fy of fiscalYears) {
      sums[fy] = { budgetRevenue: 0, actualRevenue: 0, budgetGross: 0, actualGross: 0 }
    }
    for (let i = 0; i < monthlyPL.length; i++) {
      const fy = fiscalYearOf(monthlyPL[i].month)
      const s = sums[fy]
      if (!s) continue
      s.budgetRevenue += monthly[i].budgetRevenue
      s.actualRevenue += monthly[i].actualRevenue
      s.budgetGross += monthly[i].budgetGross
      s.actualGross += monthly[i].actualGross
    }
    return sums
  }, [monthly, monthlyPL, fiscalYears])

  const chartData = buckets.map(r => ({
    label: r.label,
    売上予算: r.budgetRevenue,
    売上実績: r.actualRevenue,
    粗利予算: r.budgetGross,
    粗利実績: r.actualGross,
  }))

  return (
    <div className="space-y-6">
      {/* 表（予算/実績/達成率） */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">予算 vs 実績</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'monthly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('monthly')}
              >
                月次
              </Button>
              <Button
                variant={viewMode === 'quarterly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('quarterly')}
              >
                四半期
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-white min-w-[120px]">項目</TableHead>
                {buckets.map(r => (
                  <TableHead key={r.key} className="text-right min-w-[90px] text-xs">
                    {r.label}
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
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-blue-700 font-medium">売上予算</TableCell>
                {buckets.map(r => (
                  <TableCell key={r.key} className="text-right text-sm tabular-nums">
                    {r.budgetRevenue === 0 ? '—' : formatCurrency(r.budgetRevenue)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].budgetRevenue)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-blue-900 font-medium">売上実績</TableCell>
                {buckets.map(r => (
                  <TableCell key={r.key} className="text-right text-sm tabular-nums">
                    {r.actualRevenue === 0 ? '—' : formatCurrency(r.actualRevenue)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].actualRevenue)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow className="border-b-2">
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-gray-600">売上達成率</TableCell>
                {buckets.map(r => (
                  <TableCell key={r.key} className={`text-right text-sm tabular-nums ${ratioColor(r.actualRevenue, r.budgetRevenue)}`}>
                    {formatPercent(r.actualRevenue, r.budgetRevenue)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className={`text-right text-sm tabular-nums bg-blue-50 ${ratioColor(fiscalSums[fy].actualRevenue, fiscalSums[fy].budgetRevenue)}`}>
                    {formatPercent(fiscalSums[fy].actualRevenue, fiscalSums[fy].budgetRevenue)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-green-700 font-medium">粗利予算</TableCell>
                {buckets.map(r => (
                  <TableCell key={r.key} className="text-right text-sm tabular-nums">
                    {r.budgetGross === 0 ? '—' : formatCurrency(r.budgetGross)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].budgetGross)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-green-900 font-medium">粗利実績</TableCell>
                {buckets.map(r => (
                  <TableCell key={r.key} className="text-right text-sm tabular-nums">
                    {r.actualGross === 0 ? '—' : formatCurrency(r.actualGross)}
                  </TableCell>
                ))}
                {fiscalYears.map(fy => (
                  <TableCell key={`fy-${fy}`} className="text-right text-sm tabular-nums font-bold bg-blue-50">
                    {formatCurrency(fiscalSums[fy].actualGross)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-white text-sm pl-6 text-gray-600">粗利達成率</TableCell>
                {buckets.map(r => (
                  <TableCell key={r.key} className={`text-right text-sm tabular-nums ${ratioColor(r.actualGross, r.budgetGross)}`}>
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
        </CardContent>
      </Card>

      {/* 売上 予実 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">売上 予実</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`¥${Number(value).toLocaleString('ja-JP')}`, undefined]} />
                <Legend />
                <ReferenceLine y={0} stroke="#666" />
                <Bar dataKey="売上予算" fill="#93C5FD" radius={[2, 2, 0, 0]} />
                <Bar dataKey="売上実績" fill="#2563EB" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 粗利 予実 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">粗利 予実</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`¥${Number(value).toLocaleString('ja-JP')}`, undefined]} />
                <Legend />
                <ReferenceLine y={0} stroke="#666" />
                <Bar dataKey="粗利予算" fill="#86EFAC" radius={[2, 2, 0, 0]} />
                <Bar dataKey="粗利実績" fill="#16A34A" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
