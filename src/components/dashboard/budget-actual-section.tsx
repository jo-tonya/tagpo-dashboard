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
  budgets?: MonthlyBudget[]  // §15-7: 互換のため受け取るが現状未使用（/budgets ページは別運用）
}

type ViewMode = 'monthly' | 'quarterly'

// 月 'YYYY-MM-DD' が属する決算年度（決算月＝11月、年度開始＝12月）
function fiscalYearOf(month: string): number {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return m === 12 ? y + 1 : y
}

// 月→四半期（FY ベース）
function fiscalQuarterOf(month: string): { fy: number; q: 1 | 2 | 3 | 4; key: string; label: string } {
  const m = Number(month.slice(5, 7))
  const fy = fiscalYearOf(month)
  let q: 1 | 2 | 3 | 4
  let startY: number, startM: number, endY: number, endM: number
  if (m === 12 || m === 1 || m === 2) {
    q = 1
    startY = fy - 1; startM = 12
    endY = fy;       endM = 2
  } else if (m >= 3 && m <= 5) {
    q = 2
    startY = fy; startM = 3
    endY = fy;   endM = 5
  } else if (m >= 6 && m <= 8) {
    q = 3
    startY = fy; startM = 6
    endY = fy;   endM = 8
  } else {
    q = 4
    startY = fy; startM = 9
    endY = fy;   endM = 11
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const range = startY === endY
    ? `${startY}/${pad(startM)}月〜${pad(endM)}月`
    : `${startY}/${pad(startM)}月〜${endY}/${pad(endM)}月`
  return { fy, q, key: `${fy}-Q${q}`, label: `FY${fy} Q${q} (${range})` }
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
  budgetRevenue: number   // §15-7: campaigns.budget の月別合計
  actualRevenue: number   // §15-7: campaigns.billing_amount の月別合計
}

function buildBuckets(monthlyPL: MonthlyPL[], viewMode: ViewMode): {
  monthly: Bucket[]
  buckets: Bucket[]
  fiscalYears: number[]
  fiscalSums: Record<number, { budgetRevenue: number; actualRevenue: number }>
} {
  // §15-7: 売上予算 = MonthlyPL.budget、売上実績 = MonthlyPL.revenue
  const monthly: Bucket[] = monthlyPL.map(d => ({
    key: d.month.slice(0, 7),
    label: formatMonth(d.month),
    budgetRevenue: d.budget,
    actualRevenue: d.revenue,
  }))

  let buckets: Bucket[]
  if (viewMode === 'monthly') {
    buckets = monthly
  } else {
    const map = new Map<string, Bucket>()
    for (let i = 0; i < monthlyPL.length; i++) {
      const m = monthly[i]
      const meta = fiscalQuarterOf(monthlyPL[i].month)
      const cur = map.get(meta.key) ?? {
        key: meta.key,
        label: meta.label,
        budgetRevenue: 0,
        actualRevenue: 0,
      }
      cur.budgetRevenue += m.budgetRevenue
      cur.actualRevenue += m.actualRevenue
      map.set(meta.key, cur)
    }
    buckets = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
  }

  const fySet = new Set<number>()
  for (const d of monthlyPL) fySet.add(fiscalYearOf(d.month))
  const fiscalYears = Array.from(fySet).sort((a, b) => a - b)

  const fiscalSums: Record<number, { budgetRevenue: number; actualRevenue: number }> = {}
  for (const fy of fiscalYears) fiscalSums[fy] = { budgetRevenue: 0, actualRevenue: 0 }
  for (let i = 0; i < monthlyPL.length; i++) {
    const fy = fiscalYearOf(monthlyPL[i].month)
    const s = fiscalSums[fy]
    if (!s) continue
    s.budgetRevenue += monthly[i].budgetRevenue
    s.actualRevenue += monthly[i].actualRevenue
  }

  return { monthly, buckets, fiscalYears, fiscalSums }
}

// =====================================================
// 親コンポーネント
// =====================================================
export function BudgetActualSection({ monthlyPL }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')

  return (
    <>
      <BudgetActualCharts monthlyPL={monthlyPL} viewMode={viewMode} />
      <BudgetActualTable
        monthlyPL={monthlyPL}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
    </>
  )
}

// =====================================================
// 売上 予実グラフ（§15-7: 粗利グラフは省略）
// =====================================================
interface ChartsProps {
  monthlyPL: MonthlyPL[]
  viewMode: ViewMode
}

export function BudgetActualCharts({ monthlyPL, viewMode }: ChartsProps) {
  const { buckets } = useMemo(() => buildBuckets(monthlyPL, viewMode), [monthlyPL, viewMode])

  const chartData = buckets.map(r => ({
    label: r.label,
    売上予算: r.budgetRevenue,
    売上実績: r.actualRevenue,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">売上 予実</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={90} interval={0} />
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
  )
}

// =====================================================
// 予実表（§15-7: 粗利関連の 3 行は省略）
// =====================================================
interface TableProps {
  monthlyPL: MonthlyPL[]
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}

export function BudgetActualTable({ monthlyPL, viewMode, setViewMode }: TableProps) {
  const { buckets, fiscalYears, fiscalSums } = useMemo(
    () => buildBuckets(monthlyPL, viewMode),
    [monthlyPL, viewMode]
  )

  return (
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
            <TableRow>
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
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
