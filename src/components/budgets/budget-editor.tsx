'use client'

import { useMemo, useState } from 'react'
import { MonthlyBudget } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface BudgetEditorProps {
  initialBudgets: MonthlyBudget[]
}

// 表示する月の範囲（monthly_pl_view と整合）: 2025-11 〜 2026-12
function generateMonths(): string[] {
  const months: string[] = []
  const start = new Date('2025-11-01T00:00:00Z')
  const end = new Date('2026-12-01T00:00:00Z')
  const cursor = new Date(start)
  while (cursor <= end) {
    const y = cursor.getUTCFullYear()
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}-01`)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}

interface RowState {
  revenue: string                  // 円（入力時は文字列）
  gross_margin_rate_pct: string    // % 表示（保存時に /100 して送る）
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

export function BudgetEditor({ initialBudgets }: BudgetEditorProps) {
  const months = useMemo(() => generateMonths(), [])
  const [rows, setRows] = useState<Record<string, RowState>>(() => buildInitialRows(initialBudgets))
  const [savingMonth, setSavingMonth] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">月次予算入力</CardTitle>
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
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="h-8 text-right tabular-nums"
                      value={row.revenue}
                      onChange={e => {
                        const raw = e.target.value.replace(/,/g, '')
                        if (raw === '' || /^\d*$/.test(raw)) updateRow(month, { revenue: raw })
                      }}
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
  )
}
