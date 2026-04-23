'use client'

import React, { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Building2, User, Shield, Coins } from 'lucide-react'

interface PaymentItem {
  id: string
  category: 'subcontract' | 'personnel' | 'e_guardian' | 'user_reward'
  payee: string
  campaignName: string | null
  campaignId: number | null
  amount: number
  targetMonth: string
  status: string
  sourceTable: string
  sourceId: string
}

interface PaymentListProps {
  initialMonth: string
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

function formatMonthShort(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatYen(n: number): string {
  if (n === 0) return '—'
  return `¥${n.toLocaleString('ja-JP')}`
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  subcontract: { label: '外注', icon: Building2, color: 'bg-purple-100 text-purple-700' },
  personnel: { label: '人件費', icon: User, color: 'bg-blue-100 text-blue-700' },
  e_guardian: { label: 'EG', icon: Shield, color: 'bg-orange-100 text-orange-700' },
  user_reward: { label: 'ユーザー報酬', icon: Coins, color: 'bg-teal-100 text-teal-700' },
}

const STATUS_OPTIONS: Record<string, string[]> = {
  personnel_payments: ['見込み', '確定', '支払済'],
  fixed_costs: ['見込み', '確定'],
  campaign_costs: ['未払い'],
}

const STATUS_COLORS: Record<string, string> = {
  '見込み': 'bg-gray-100 text-gray-700',
  '確定': 'bg-blue-100 text-blue-700',
  '支払済': 'bg-green-100 text-green-700',
  '未払い': 'bg-yellow-100 text-yellow-700',
  '未実行': 'bg-gray-100 text-gray-700',
  '実行': 'bg-blue-100 text-blue-700',
  '確認済': 'bg-green-100 text-green-700',
}

export function PaymentList({ initialMonth }: PaymentListProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth)
  const [showAllMonths, setShowAllMonths] = useState(false)
  const [items, setItems] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const url = showAllMonths
        ? '/api/payments'
        : `/api/payments?month=${currentMonth}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setItems(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [currentMonth, showAllMonths])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const filteredItems = items.filter(item =>
    categoryFilter === 'all' || item.category === categoryFilter
  )

  const totalAmount = filteredItems.reduce((sum, i) => sum + i.amount, 0)
  const unpaidStatuses = ['未払い', '見込み', '未実行']
  const unpaidAmount = filteredItems
    .filter(i => unpaidStatuses.includes(i.status))
    .reduce((sum, i) => sum + i.amount, 0)

  const updateStatus = async (item: PaymentItem, newStatus: string) => {
    // Optimistic
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))

    try {
      await fetch('/api/payments/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTable: item.sourceTable,
          sourceId: item.sourceId,
          status: newStatus,
        }),
      })
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="space-y-4">
      {/* Month nav + all months toggle */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
          disabled={showAllMonths}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className={`text-lg font-semibold min-w-[140px] text-center ${showAllMonths ? 'text-gray-400' : ''}`}>
          {formatMonth(currentMonth)}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          disabled={showAllMonths}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant={showAllMonths ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowAllMonths(!showAllMonths)}
        >
          全月表示
        </Button>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-500">支払い総額:</span>{' '}
              <span className="font-bold text-lg">{formatYen(totalAmount)}</span>
            </div>
            <div>
              <span className="text-gray-500">未払い:</span>{' '}
              <span className="font-bold text-lg text-red-600">{formatYen(unpaidAmount)}</span>
            </div>
            <div>
              <span className="text-gray-500">項目数:</span>{' '}
              <span className="font-bold">{filteredItems.length}件</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category filter */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'すべて' },
          { key: 'subcontract', label: '外注' },
          { key: 'personnel', label: '人件費' },
          { key: 'e_guardian', label: 'EG' },
          { key: 'user_reward', label: 'ユーザー報酬' },
        ].map(f => (
          <Button
            key={f.key}
            variant={categoryFilter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Items table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-gray-500 py-8 text-center">読み込み中...</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">データがありません</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">カテゴリ</TableHead>
                  <TableHead className="min-w-[150px]">支払い先</TableHead>
                  <TableHead className="min-w-[150px]">関連案件</TableHead>
                  <TableHead className="text-right min-w-[120px]">金額</TableHead>
                  {showAllMonths && <TableHead className="min-w-[80px]">支払い月</TableHead>}
                  <TableHead className="min-w-[110px]">状況</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(item => {
                  const catConfig = CATEGORY_CONFIG[item.category]
                  const CatIcon = catConfig?.icon
                  const statusOpts = STATUS_OPTIONS[item.sourceTable] || [item.status]
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${catConfig?.color || ''}`}>
                          {CatIcon && <CatIcon className="h-3 w-3 mr-1 inline" />}
                          {catConfig?.label || item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{item.payee}</TableCell>
                      <TableCell className="text-sm">
                        {item.campaignId ? (
                          <Link href={`/campaigns/${item.campaignId}`} className="text-blue-600 hover:underline">
                            {item.campaignName}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatYen(item.amount)}</TableCell>
                      {showAllMonths && (
                        <TableCell className="text-sm text-gray-500">{formatMonthShort(item.targetMonth)}</TableCell>
                      )}
                      <TableCell>
                        {statusOpts.length > 1 ? (
                          <Select
                            value={item.status}
                            onValueChange={v => v && updateStatus(item, v)}
                          >
                            <SelectTrigger className="h-7 text-xs w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOpts.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[item.status] || ''}`}>
                            {item.status}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
