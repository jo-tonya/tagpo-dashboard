'use client'

import { useMemo, useState } from 'react'
import { MonthlyBudget } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { NumericInput } from '@/components/ui/numeric-input'
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
import { toast } from 'sonner'

interface BudgetEditorProps {
  initialBudgets: MonthlyBudget[]
}

// 月→決算年度（決算月＝11月、年度開始＝12月）
function fiscalYearOf(month: string): number {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return m === 12 ? y + 1 : y
}

// 指定 FY の 12 ヶ月（YYYY-MM-01 形式）。FY2026 → ['2025-12-01', '2026-01-01', ..., '2026-11-01']
function getFiscalYearMonths(fy: number): string[] {
  const months: string[] = []
  months.push(`${fy - 1}-12-01`)
  for (let m = 1; m <= 11; m++) months.push(`${fy}-${String(m).padStart(2, '0')}-01`)
  return months
}

interface RowState {
  revenue: string
  gross_margin_rate_pct: string
  note: string
  dirty: boolean
}

function buildInitialRows(initial: MonthlyBudget[]): Record<string, RowState> {
  const map: Record<string, RowState> = {}
  for (const b of initial) {
    map[b.month] = {
      revenue: b.revenue ? String(b.revenue) : '',
      gross_margin_rate_pct: b.gross_margin_rate ? String(Math.round(b.gross_margin_rate * 10000) / 100) : '',
      note: b.note ?? '',
      dirty: false,
    }
  }
  return map
}

const formatYAxis = (value: number) => {
  if (value === 0) return '0'
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`
  return value.toString()
}

export function BudgetEditor({ initialBudgets }: BudgetEditorProps) {
  // 直近 3 年度（前年度・今年度・次年度）。今年度は実行時の `now` から決定。
  const today = new Date()
  const currentFY = fiscalYearOf(today.toISOString().slice(0, 10))
  const fiscalYears = [currentFY - 1, currentFY, currentFY + 1]

  const [selectedFY, setSelectedFY] = useState<number>(currentFY)
  const [rows, setRows] = useState<Record<string, RowState>>(() => buildInitialRows(initialBudgets))
  const [savingMonth, setSavingMonth] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  // 表示対象月（選択 FY の 12 ヶ月）
  const months = useMemo(() => getFiscalYearMonths(selectedFY), [selectedFY])

  function getRow(month: string): RowState {
    return rows[month] ?? { revenue: '', gross_margin_rate_pct: '', note: '', dirty: false }
  }

  function updateRow(month: string, patch: Partial<RowState>) {
    setRows(prev => {
      const cur = prev[month] ?? { revenue: '', gross_margin_rate_pct: '', note: '', dirty: false }
      return { ...prev, [month]: { ...cur, ...patch, dirty: true } }
    })
  }

  function calcGrossProfit(row: RowState): number {
    const rev = parseFloat(row.revenue) || 0
    const pct = parseFloat(row.gross_margin_rate_pct) || 0
    return Math.round(rev * pct / 100)
  }

  // チャート用データ（選択 FY の 12 ヶ月）
  const chartData = useMemo(() => {
    return months.map(month => {
      const row = getRow(month)
      return {
        label: formatMonth(month),
        売上予算: parseFloat(row.revenue) || 0,
        粗利予算: calcGrossProfit(row),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, rows])

  async function saveOne(month: string): Promise<boolean> {
    const row = getRow(month)
    setSavingMonth(month)
    try {
      const rev = parseFloat(row.revenue) || 0
      const pct = parseFloat(row.gross_margin_rate_pct) || 0
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          revenue: rev,
          gross_margin_rate: pct / 100,
          note: row.note || null,
        }),
      })
      if (!res.ok) {
        toast.error(`${formatMonth(month)} の保存に失敗しました`)
        return false
      }
      setRows(prev => ({ ...prev, [month]: { ...getRow(month), dirty: false } }))
      return true
    } finally {
      setSavingMonth(null)
    }
  }

  async function saveAllDirty() {
    const dirtyMonths = months.filter(m => getRow(m).dirty)
    if (dirtyMonths.length === 0) {
      toast.info('変更はありません')
      return
    }
    setSavingAll(true)
    try {
      const results = await Promise.all(dirtyMonths.map(m => saveOne(m)))
      const okCount = results.filter(Boolean).length
      if (okCount === dirtyMonths.length) {
        toast.success(`${okCount}件保存しました`)
      } else {
        toast.error(`${okCount}/${dirtyMonths.length}件のみ保存`)
      }
    } finally {
      setSavingAll(false)
    }
  }

  const dirtyCount = months.filter(m => getRow(m).dirty).length

  return (
    <div className="space-y-6">
      {/* グラフ + FY タブ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">予算推移</CardTitle>
            <div className="flex gap-2">
              {fiscalYears.map(fy => (
                <Button
                  key={fy}
                  variant={selectedFY === fy ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedFY(fy)}
                >
                  {fy}年度
                </Button>
              ))}
            </div>
          </div>
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
                <Bar dataKey="売上予算" fill="#2563EB" radius={[2, 2, 0, 0]} />
                <Bar dataKey="粗利予算" fill="#16A34A" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 月次予算入力テーブル */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">月次予算入力（{selectedFY}年度）</CardTitle>
            <Button
              onClick={saveAllDirty}
              disabled={savingAll || dirtyCount === 0}
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              {savingAll ? '保存中...' : dirtyCount > 0 ? `変更を保存（${dirtyCount}件）` : '保存'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">月</TableHead>
                <TableHead className="text-right w-[180px]">売上予算（円）</TableHead>
                <TableHead className="text-right w-[140px]">粗利率（%）</TableHead>
                <TableHead className="text-right w-[160px]">粗利（自動）</TableHead>
                <TableHead>備考</TableHead>
                <TableHead className="text-center w-[100px]">保存</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map(month => {
                const row = getRow(month)
                const grossProfit = calcGrossProfit(row)
                const isSaving = savingMonth === month
                return (
                  <TableRow key={month}>
                    <TableCell className="text-sm font-medium">{formatMonth(month)}</TableCell>
                    <TableCell>
                      <NumericInput
                        className="h-8 text-right tabular-nums"
                        value={row.revenue}
                        onChange={v => updateRow(month, { revenue: v })}
                        integerOnly
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-8 text-right tabular-nums"
                        value={row.gross_margin_rate_pct}
                        onChange={e => {
                          const raw = e.target.value
                          if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) updateRow(month, { gross_margin_rate_pct: raw })
                        }}
                        placeholder="例: 40"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-gray-600">
                      {grossProfit > 0 ? formatCurrency(grossProfit) : '—'}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        className="h-8 text-sm"
                        value={row.note}
                        onChange={e => updateRow(month, { note: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={row.dirty ? 'default' : 'outline'}
                        className={row.dirty ? 'bg-blue-600 hover:bg-blue-700 h-7 text-xs' : 'h-7 text-xs'}
                        disabled={isSaving || !row.dirty}
                        onClick={() => saveOne(month)}
                      >
                        {isSaving ? '...' : '保存'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
