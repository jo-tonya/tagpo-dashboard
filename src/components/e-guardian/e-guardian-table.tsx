'use client'

import React, { useState, useRef, useCallback } from 'react'
import { FixedCost } from '@/lib/types'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const MONTHS = Array.from({ length: 14 }, (_, i) => {
  const year = 2025 + Math.floor((10 + i) / 12)
  const month = ((10 + i) % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
})

const SUBCATEGORIES = ['管理費', '審査（実費入力）'] as const

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  return `${y}/${m}`
}

function formatYen(n: number): string {
  if (n === 0) return '—'
  return `¥${n.toLocaleString('ja-JP')}`
}

interface EGuardianTableProps {
  initialData: FixedCost[]
}

type CellKey = `${string}::${string}` // subcategory::month

export function EGuardianTable({ initialData }: EGuardianTableProps) {
  const [data, setData] = useState<Record<CellKey, FixedCost>>(() => {
    const map: Record<CellKey, FixedCost> = {}
    for (const item of initialData) {
      const key: CellKey = `${item.cost_subcategory}::${item.target_month}`
      map[key] = item
    }
    return map
  })

  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const getCell = useCallback((sub: string, month: string): FixedCost | undefined => {
    return data[`${sub}::${month}`]
  }, [data])

  const saveCell = useCallback(async (sub: string, month: string, updates: Partial<FixedCost>) => {
    const key: CellKey = `${sub}::${month}`
    const existing = data[key]
    const record = {
      cost_category: 'e_guardian',
      cost_subcategory: sub,
      target_month: month,
      amount: existing?.amount || 0,
      quantity: existing?.quantity || null,
      unit_price: existing?.unit_price || null,
      status: existing?.status || '見込み',
      note: existing?.note || null,
      ...updates,
    }

    // If review fee and quantity + unit_price provided, calculate amount
    if (sub === '審査（実費入力）' && record.quantity && record.unit_price) {
      record.amount = record.quantity * record.unit_price
    }

    // Optimistic update
    setData(prev => ({
      ...prev,
      [key]: { id: existing?.id || '', ...record } as FixedCost,
    }))

    try {
      const res = await fetch('/api/fixed-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      const saved = await res.json()
      setData(prev => ({ ...prev, [key]: saved }))
    } catch (e) {
      console.error(e)
    }
  }, [data])

  const startEdit = (cellId: string, currentValue: number | null) => {
    setEditingCell(cellId)
    setEditValue(currentValue ? String(currentValue) : '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const commitEdit = (sub: string, month: string, field: 'amount' | 'quantity' | 'unit_price') => {
    const numVal = Number(editValue) || 0
    setEditingCell(null)
    if (field === 'amount') {
      saveCell(sub, month, { amount: numVal })
    } else if (field === 'quantity') {
      saveCell(sub, month, { quantity: numVal })
    } else if (field === 'unit_price') {
      saveCell(sub, month, { unit_price: numVal })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, sub: string, month: string, field: 'amount' | 'quantity' | 'unit_price') => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commitEdit(sub, month, field)
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  const toggleMonthStatus = (month: string) => {
    const currentStatus = getCell('管理費', month)?.status || '見込み'
    const newStatus = currentStatus === '確定' ? '見込み' : '確定'
    saveCell('管理費', month, { status: newStatus })
    saveCell('審査（実費入力）', month, { status: newStatus })
  }

  // Calculate totals
  const monthTotal = (month: string): number => {
    return SUBCATEGORIES.reduce((sum, sub) => sum + (getCell(sub, month)?.amount || 0), 0)
  }

  const yearTotal = (sub: string, yearPrefix: string): number => {
    return MONTHS
      .filter(m => m.startsWith(yearPrefix))
      .reduce((sum, m) => sum + (getCell(sub, m)?.amount || 0), 0)
  }

  const yearMonthTotal = (yearPrefix: string): number => {
    return MONTHS
      .filter(m => m.startsWith(yearPrefix))
      .reduce((sum, m) => sum + monthTotal(m), 0)
  }

  const renderEditableCell = (sub: string, month: string, field: 'amount' | 'quantity' | 'unit_price', value: number | null | undefined) => {
    const cellId = `${sub}::${month}::${field}`
    if (editingCell === cellId) {
      return (
        <input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(sub, month, field)}
          onKeyDown={e => handleKeyDown(e, sub, month, field)}
          className="w-full h-7 px-1 text-right text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )
    }
    return (
      <span
        className="cursor-pointer hover:bg-blue-50 block px-1 py-0.5 rounded text-right"
        onClick={() => startEdit(cellId, value ?? null)}
      >
        {field === 'amount' ? formatYen(value || 0)
          : field === 'quantity' ? (value ? `${value}件` : '—')
          : (value ? `@${value.toLocaleString('ja-JP')}` : '—')}
      </span>
    )
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-white min-w-[160px]">項目</TableHead>
              {MONTHS.map(m => (
                <TableHead key={m} className="text-right min-w-[100px] text-xs">
                  {formatMonth(m)}
                </TableHead>
              ))}
              <TableHead className="text-right min-w-[110px] font-bold bg-blue-50 text-xs">2025年計</TableHead>
              <TableHead className="text-right min-w-[110px] font-bold bg-blue-50 text-xs">2026年計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* 管理費 row */}
            <TableRow>
              <TableCell className="sticky left-0 z-10 bg-white text-sm font-medium">管理費</TableCell>
              {MONTHS.map(m => (
                <TableCell key={m} className="text-right text-sm p-1">
                  {renderEditableCell('管理費', m, 'amount', getCell('管理費', m)?.amount)}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm font-bold bg-blue-50">{formatYen(yearTotal('管理費', '2025'))}</TableCell>
              <TableCell className="text-right text-sm font-bold bg-blue-50">{formatYen(yearTotal('管理費', '2026'))}</TableCell>
            </TableRow>

            {/* 審査費 amount row */}
            <TableRow>
              <TableCell className="sticky left-0 z-10 bg-white text-sm font-medium">審査費</TableCell>
              {MONTHS.map(m => (
                <TableCell key={m} className="text-right text-sm p-1">
                  {renderEditableCell('審査（実費入力）', m, 'amount', getCell('審査（実費入力）', m)?.amount)}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm font-bold bg-blue-50">{formatYen(yearTotal('審査（実費入力）', '2025'))}</TableCell>
              <TableCell className="text-right text-sm font-bold bg-blue-50">{formatYen(yearTotal('審査（実費入力）', '2026'))}</TableCell>
            </TableRow>

            {/* 審査 件数 row */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs text-gray-500 pl-6">件数</TableCell>
              {MONTHS.map(m => (
                <TableCell key={m} className="text-right text-xs text-gray-500 p-1">
                  {renderEditableCell('審査（実費入力）', m, 'quantity', getCell('審査（実費入力）', m)?.quantity)}
                </TableCell>
              ))}
              <TableCell className="bg-blue-50" />
              <TableCell className="bg-blue-50" />
            </TableRow>

            {/* 審査 単価 row */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs text-gray-500 pl-6">単価</TableCell>
              {MONTHS.map(m => (
                <TableCell key={m} className="text-right text-xs text-gray-500 p-1">
                  {renderEditableCell('審査（実費入力）', m, 'unit_price', getCell('審査（実費入力）', m)?.unit_price)}
                </TableCell>
              ))}
              <TableCell className="bg-blue-50" />
              <TableCell className="bg-blue-50" />
            </TableRow>

            {/* Status row */}
            <TableRow className="bg-gray-50">
              <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs text-gray-500">ステータス</TableCell>
              {MONTHS.map(m => {
                // Use the status of the management fee for the month
                const status = getCell('管理費', m)?.status || '見込み'
                return (
                  <TableCell key={m} className="text-center p-1">
                    <Badge
                      variant={status === '確定' ? 'default' : 'outline'}
                      className={`cursor-pointer text-xs ${status === '確定' ? 'bg-green-600 hover:bg-green-700' : 'hover:bg-gray-100'}`}
                      onClick={() => toggleMonthStatus(m)}
                    >
                      {status}
                    </Badge>
                  </TableCell>
                )
              })}
              <TableCell className="bg-blue-50" />
              <TableCell className="bg-blue-50" />
            </TableRow>

            {/* 月計 row */}
            <TableRow className="border-t-2 font-bold">
              <TableCell className="sticky left-0 z-10 bg-white text-sm font-bold">月計</TableCell>
              {MONTHS.map(m => (
                <TableCell key={m} className="text-right text-sm font-bold">
                  {formatYen(monthTotal(m))}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm font-bold bg-blue-50">{formatYen(yearMonthTotal('2025'))}</TableCell>
              <TableCell className="text-right text-sm font-bold bg-blue-50">{formatYen(yearMonthTotal('2026'))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="text-xs text-gray-400 mt-3">※ セルをクリックで編集。Enter/Tab で確定。審査費は件数×単価の入力で金額が自動計算されます。</p>
      </CardContent>
    </Card>
  )
}
