'use client'

import React, { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ReceivableItem {
  id: string
  campaignId: number
  campaignName: string
  billingMonth: string
  receiveMonth: string
  expectedAmount: number
  actualAmount: number | null
  status: string
  note: string | null
}

interface ReceivableListProps {
  initialMonth: string
}

function formatMonthDisplay(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  return `${y}年${parseInt(m)}月`
}

function formatMonthShort(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  return `${y}/${m}`
}

function addMonths(dateStr: string, n: number): string {
  const [y, m] = dateStr.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

function formatYen(n: number): string {
  if (n === 0) return '—'
  return `¥${n.toLocaleString('ja-JP')}`
}

const STATUS_COLORS: Record<string, string> = {
  '未入金': 'bg-yellow-100 text-yellow-700',
  '入金済': 'bg-green-100 text-green-700',
}

export function ReceivableList({ initialMonth }: ReceivableListProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth)
  const [showAll, setShowAll] = useState(false)
  const [items, setItems] = useState<ReceivableItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const url = showAll ? '/api/receivables' : `/api/receivables?month=${currentMonth}`
    const res = await fetch(url)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [currentMonth, showAll])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData() }, [fetchData])

  const updateReceivable = async (item: ReceivableItem, updates: Partial<ReceivableItem>) => {
    const updated = { ...item, ...updates }
    setItems(prev => prev.map(i => i.campaignId === item.campaignId ? updated : i))
    await fetch('/api/receivables/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: item.campaignId,
        billing_month: item.billingMonth,
        receive_month: item.receiveMonth,
        expected_amount: item.expectedAmount,
        actual_amount: updates.actualAmount !== undefined ? updates.actualAmount : item.actualAmount,
        status: updates.status || item.status,
        note: updates.note !== undefined ? updates.note : item.note,
      }),
    })
  }

  const startEdit = (cellId: string, value: string) => {
    setEditingCell(cellId)
    setEditValue(value)
  }

  const commitAmountEdit = (item: ReceivableItem) => {
    setEditingCell(null)
    const num = parseFloat(editValue)
    updateReceivable(item, { actualAmount: isNaN(num) || num <= 0 ? null : num })
  }

  const commitNoteEdit = (item: ReceivableItem) => {
    setEditingCell(null)
    updateReceivable(item, { note: editValue || null })
  }

  const totalExpected = items.reduce((s, i) => s + i.expectedAmount, 0)
  const totalReceived = items.filter(i => i.status === '入金済').reduce((s, i) => s + (i.actualAmount || i.expectedAmount), 0)
  const unpaidCount = items.filter(i => i.status === '未入金').length

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} disabled={showAll}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-bold text-lg min-w-[120px] text-center">
          {showAll ? '全期間' : formatMonthDisplay(currentMonth)}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} disabled={showAll}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => setShowAll(!showAll)}>
          全月表示
        </Button>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="py-3 px-4 flex items-center gap-6">
          <div>
            <span className="text-sm text-gray-500">入金予定総額: </span>
            <span className="font-bold tabular-nums">{formatYen(totalExpected)}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">入金済: </span>
            <span className="font-bold tabular-nums text-green-700">{formatYen(totalReceived)}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">未入金: </span>
            <span className="font-bold text-yellow-700">{unpaidCount}件</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="text-center text-gray-500 py-8">読み込み中...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-500 py-8">データがありません</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件名</TableHead>
                  <TableHead className="text-right">請求月</TableHead>
                  <TableHead className="text-right">入金予定月</TableHead>
                  <TableHead className="text-right">請求金額</TableHead>
                  <TableHead className="text-right">入金額</TableHead>
                  <TableHead className="text-center">状況</TableHead>
                  <TableHead>備考</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={`${item.campaignId}-${item.receiveMonth}`}>
                    <TableCell>
                      <Link href={`/campaigns/${item.campaignId}`} className="text-blue-600 hover:underline text-sm">
                        {item.campaignName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatMonthShort(item.billingMonth)}</TableCell>
                    <TableCell className="text-right text-sm">{formatMonthShort(item.receiveMonth)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatYen(item.expectedAmount)}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      {editingCell === `amount-${item.campaignId}` ? (
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="h-7 text-xs w-[120px] text-right ml-auto"
                          value={editValue}
                          autoFocus
                          onChange={e => {
                            const raw = e.target.value.replace(/,/g, '')
                            if (raw === '' || /^-?\d*$/.test(raw)) setEditValue(raw)
                          }}
                          onBlur={() => commitAmountEdit(item)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                        />
                      ) : (
                        <span
                          className={`cursor-pointer hover:underline tabular-nums text-sm ${item.actualAmount ? 'text-black font-medium' : 'text-gray-400'}`}
                          onClick={() => startEdit(`amount-${item.campaignId}`, item.actualAmount?.toString() || '')}
                          title="クリックで入金額を入力"
                        >
                          {item.actualAmount ? formatYen(item.actualAmount) : '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <Select
                        value={item.status}
                        onValueChange={v => v && updateReceivable(item, { status: v })}
                      >
                        <SelectTrigger className={`h-7 text-xs w-[90px] ${STATUS_COLORS[item.status] || ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="未入金">未入金</SelectItem>
                          <SelectItem value="入金済">入金済</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {editingCell === `note-${item.campaignId}` ? (
                        <Input
                          type="text"
                          className="h-7 text-xs w-[150px]"
                          value={editValue}
                          autoFocus
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitNoteEdit(item)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:underline text-xs text-gray-500"
                          onClick={() => startEdit(`note-${item.campaignId}`, item.note || '')}
                          title="クリックで備考を入力"
                        >
                          {item.note || '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
