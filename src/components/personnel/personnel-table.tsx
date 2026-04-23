'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Personnel, PersonnelPayment } from '@/lib/types'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'

const MONTHS = Array.from({ length: 14 }, (_, i) => {
  const year = 2025 + Math.floor((10 + i) / 12)
  const month = ((10 + i) % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
})

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  return `${y}/${m}`
}

function formatYen(n: number): string {
  if (n === 0) return '—'
  return `¥${n.toLocaleString('ja-JP')}`
}

interface PersonnelTableProps {
  personnel: Personnel[]
  payments: PersonnelPayment[]
}

export function PersonnelTable({ personnel: initialPersonnel, payments: initialPayments }: PersonnelTableProps) {
  const [personnel, setPersonnel] = useState(initialPersonnel)
  const [payments, setPayments] = useState(initialPayments)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Add person dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('アルバイト')

  // Edit person dialog
  const [editPerson, setEditPerson] = useState<Personnel | null>(null)
  const [editPersonName, setEditPersonName] = useState('')
  const [editPersonRole, setEditPersonRole] = useState('')

  const getPayment = useCallback((personnelId: string, month: string): number => {
    const p = payments.find(p => p.personnel_id === personnelId && p.target_month === month)
    return p?.amount || 0
  }, [payments])

  const startEdit = (cellId: string, currentValue: number) => {
    setEditingCell(cellId)
    setEditValue(currentValue ? String(currentValue) : '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const commitEdit = async (personnelId: string, month: string) => {
    const amount = Number(editValue) || 0
    setEditingCell(null)

    // Optimistic update
    setPayments(prev => {
      const idx = prev.findIndex(p => p.personnel_id === personnelId && p.target_month === month)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], amount }
        return updated
      }
      return [...prev, {
        id: `temp-${personnelId}-${month}`,
        personnel_id: personnelId,
        target_month: month,
        amount,
        payment_type: 'salary',
        quantity: null,
        unit_price: null,
        status: '見込み',
      }]
    })

    try {
      const res = await fetch('/api/personnel/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnel_id: personnelId, target_month: month, amount }),
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      const saved = await res.json()
      setPayments(prev => prev.map(p =>
        (p.personnel_id === personnelId && p.target_month === month) ? saved : p
      ))
    } catch (e) {
      console.error(e)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, personnelId: string, month: string) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commitEdit(personnelId, month)
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  const addPerson = async () => {
    if (!newName.trim()) return
    try {
      const res = await fetch('/api/personnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), role: newRole }),
      })
      if (!res.ok) throw new Error('登録に失敗しました')
      const person = await res.json()
      setPersonnel(prev => [...prev, person])
      setShowAddDialog(false)
      setNewName('')
      setNewRole('アルバイト')
    } catch (e) {
      console.error(e)
    }
  }

  const openEditPerson = (p: Personnel) => {
    setEditPerson(p)
    setEditPersonName(p.name)
    setEditPersonRole(p.role || 'アルバイト')
  }

  const saveEditPerson = async () => {
    if (!editPerson) return
    try {
      const res = await fetch(`/api/personnel/${editPerson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editPersonName, role: editPersonRole }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
      const updated = await res.json()
      setPersonnel(prev => prev.map(p => p.id === updated.id ? updated : p))
      setEditPerson(null)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleActive = async () => {
    if (!editPerson) return
    try {
      const res = await fetch(`/api/personnel/${editPerson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !editPerson.is_active }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
      const updated = await res.json()
      setPersonnel(prev => prev.map(p => p.id === updated.id ? updated : p))
      setEditPerson({ ...editPerson, is_active: updated.is_active })
    } catch (e) {
      console.error(e)
    }
  }

  const monthTotal = (month: string): number => {
    return personnel
      .filter(p => p.is_active)
      .reduce((sum, p) => sum + getPayment(p.id, month), 0)
  }

  const yearTotalForPerson = (personnelId: string, yearPrefix: string): number => {
    return MONTHS
      .filter(m => m.startsWith(yearPrefix))
      .reduce((sum, m) => sum + getPayment(personnelId, m), 0)
  }

  const yearMonthTotal = (yearPrefix: string): number => {
    return MONTHS
      .filter(m => m.startsWith(yearPrefix))
      .reduce((sum, m) => sum + monthTotal(m), 0)
  }

  const activePersonnel = personnel.filter(p => p.is_active)
  const inactivePersonnel = personnel.filter(p => !p.is_active)

  const getMonthStatus = useCallback((month: string): string => {
    const monthPayments = payments.filter(p =>
      p.target_month === month &&
      activePersonnel.some(person => person.id === p.personnel_id)
    )
    if (monthPayments.length === 0) return '見込み'
    return monthPayments.every(p => p.status === '確定') ? '確定' : '見込み'
  }, [payments, activePersonnel])

  const toggleMonthStatus = async (month: string) => {
    const currentStatus = getMonthStatus(month)
    const newStatus = currentStatus === '確定' ? '見込み' : '確定'
    setPayments(prev => prev.map(p =>
      p.target_month === month ? { ...p, status: newStatus } : p
    ))
    try {
      await fetch('/api/personnel/payments/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_month: month, status: newStatus }),
      })
    } catch (e) {
      console.error(e)
      setPayments(prev => prev.map(p =>
        p.target_month === month ? { ...p, status: currentStatus } : p
      ))
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">アルバイト・インターンの月次支払い管理</p>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          人員追加
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-white min-w-[120px]">名前</TableHead>
                <TableHead className="min-w-[80px] text-xs">役割</TableHead>
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
              {activePersonnel.map(person => (
                <TableRow key={person.id}>
                  <TableCell className="sticky left-0 z-10 bg-white text-sm">
                    <button
                      className="text-blue-600 hover:underline font-medium"
                      onClick={() => openEditPerson(person)}
                    >
                      {person.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-xs">
                      {person.role || '—'}
                    </Badge>
                  </TableCell>
                  {MONTHS.map(m => {
                    const cellId = `${person.id}::${m}`
                    const val = getPayment(person.id, m)
                    if (editingCell === cellId) {
                      return (
                        <TableCell key={m} className="p-1">
                          <input
                            ref={inputRef}
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(person.id, m)}
                            onKeyDown={e => handleKeyDown(e, person.id, m)}
                            className="w-full h-7 px-1 text-right text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </TableCell>
                      )
                    }
                    return (
                      <TableCell key={m} className="text-right text-sm p-1">
                        <span
                          className="cursor-pointer hover:bg-blue-50 block px-1 py-0.5 rounded"
                          onClick={() => startEdit(cellId, val)}
                        >
                          {formatYen(val)}
                        </span>
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-right text-sm font-bold bg-blue-50">
                    {formatYen(yearTotalForPerson(person.id, '2025'))}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold bg-blue-50">
                    {formatYen(yearTotalForPerson(person.id, '2026'))}
                  </TableCell>
                </TableRow>
              ))}

              {inactivePersonnel.length > 0 && inactivePersonnel.map(person => (
                <TableRow key={person.id} className="opacity-40">
                  <TableCell className="sticky left-0 z-10 bg-white text-sm">
                    <button
                      className="text-gray-400 hover:underline"
                      onClick={() => openEditPerson(person)}
                    >
                      {person.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">{person.role || '—'}</TableCell>
                  {MONTHS.map(m => (
                    <TableCell key={m} className="text-right text-sm text-gray-400">
                      {formatYen(getPayment(person.id, m))}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-sm bg-blue-50 text-gray-400">
                    {formatYen(yearTotalForPerson(person.id, '2025'))}
                  </TableCell>
                  <TableCell className="text-right text-sm bg-blue-50 text-gray-400">
                    {formatYen(yearTotalForPerson(person.id, '2026'))}
                  </TableCell>
                </TableRow>
              ))}

              {/* Monthly totals */}
              <TableRow className="border-t-2 font-bold">
                <TableCell className="sticky left-0 z-10 bg-white text-sm font-bold">月計</TableCell>
                <TableCell />
                {MONTHS.map(m => (
                  <TableCell key={m} className="text-right text-sm font-bold">
                    {formatYen(monthTotal(m))}
                  </TableCell>
                ))}
                <TableCell className="text-right text-sm font-bold bg-blue-50">
                  {formatYen(yearMonthTotal('2025'))}
                </TableCell>
                <TableCell className="text-right text-sm font-bold bg-blue-50">
                  {formatYen(yearMonthTotal('2026'))}
                </TableCell>
              </TableRow>

              {/* Status row */}
              <TableRow className="bg-gray-50">
                <TableCell className="sticky left-0 z-10 bg-gray-50 text-xs text-gray-500">ステータス</TableCell>
                <TableCell />
                {MONTHS.map(m => {
                  const status = getMonthStatus(m)
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
            </TableBody>
          </Table>
          <p className="text-xs text-gray-400 mt-3">※ セルをクリックで編集。Enter/Tab で確定。名前をクリックで人員情報を編集。</p>
        </CardContent>
      </Card>

      {/* Add Person Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>人員追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>名前</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="名前を入力"
                onKeyDown={e => e.key === 'Enter' && addPerson()}
              />
            </div>
            <div>
              <Label>役割</Label>
              <Select value={newRole} onValueChange={v => v && setNewRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="アルバイト">アルバイト</SelectItem>
                  <SelectItem value="インターン">インターン</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>キャンセル</Button>
            <Button onClick={addPerson}>登録</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Person Dialog */}
      <Dialog open={!!editPerson} onOpenChange={open => !open && setEditPerson(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>人員情報の編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>名前</Label>
              <Input
                value={editPersonName}
                onChange={e => setEditPersonName(e.target.value)}
              />
            </div>
            <div>
              <Label>役割</Label>
              <Select value={editPersonRole} onValueChange={v => v && setEditPersonRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="アルバイト">アルバイト</SelectItem>
                  <SelectItem value="インターン">インターン</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-gray-500">
                ステータス: {editPerson?.is_active ? '有効' : '無効'}
              </span>
              <Button
                variant={editPerson?.is_active ? 'destructive' : 'default'}
                size="sm"
                onClick={toggleActive}
              >
                {editPerson?.is_active ? '無効にする' : '有効にする'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPerson(null)}>キャンセル</Button>
            <Button onClick={saveEditPerson}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
