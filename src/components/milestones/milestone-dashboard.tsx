'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Campaign } from '@/lib/types'
import { MS_DEFS, isMilestoneOverdue, daysDiff } from '@/lib/milestones'
import { calcRequiredViews, calcTargetPosts, formatCurrency } from '@/lib/calculations'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, Check, AlertTriangle, ExternalLink } from 'lucide-react'

interface MilestoneDashboardProps {
  campaigns: Campaign[]
  initialChecks: Record<string, boolean>
}

const STATUS_LIST = ['未確定', 'シート回収済み', '進行中', '投稿中', '完了'] as const
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '未確定':       { bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200' },
  'シート回収済み': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  '進行中':       { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  '投稿中':       { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  '完了':         { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
}

type SortKey = 'postStart' | 'budget' | 'maker'

export function MilestoneDashboard({ campaigns, initialChecks }: MilestoneDashboardProps) {
  const [checks, setChecks] = useState<Record<string, boolean>>(initialChecks)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('postStart')
  const memoTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // Toggle milestone check
  const toggleCheck = useCallback(async (campaignId: number, milestoneKey: string) => {
    const key = `${campaignId}-${milestoneKey}`
    const newChecked = !checks[key]

    // Optimistic update
    setChecks(prev => ({ ...prev, [key]: newChecked }))

    // Sync to DB
    try {
      await fetch('/api/milestones/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, milestone_key: milestoneKey, checked: newChecked }),
      })
    } catch (err) {
      // Revert on error
      setChecks(prev => ({ ...prev, [key]: !newChecked }))
      console.error('Failed to toggle milestone:', err)
    }
  }, [checks])

  // Update status
  const updateStatus = useCallback(async (id: number, status: string) => {
    try {
      await fetch(`/api/campaigns/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      // Force page refresh to get updated data
      window.location.reload()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }, [])

  // Update memo (debounced)
  const updateMemo = useCallback((id: number, memo: string) => {
    if (memoTimers.current[id]) clearTimeout(memoTimers.current[id])
    memoTimers.current[id] = setTimeout(async () => {
      try {
        await fetch(`/api/campaigns/${id}/memo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memo }),
        })
      } catch (err) {
        console.error('Failed to update memo:', err)
      }
    }, 800)
  }, [])

  // Count overdue for a campaign
  const countOverdue = useCallback((campaign: Campaign) => {
    return MS_DEFS.reduce((count, ms) => {
      const dateStr = campaign[ms.dbCol as keyof Campaign] as string | null
      const checked = checks[`${campaign.id}-${ms.key}`] || false
      return count + (isMilestoneOverdue(dateStr, ms.deadlineOffset, checked) ? 1 : 0)
    }, 0)
  }, [checks])

  // Filter & sort
  const filtered = useMemo(() => {
    const list = statusFilters.size > 0
      ? campaigns.filter(c => statusFilters.has(c.status))
      : [...campaigns]
    list.sort((a, b) => {
      if (sortKey === 'postStart') {
        return (a.post_start || '9999').localeCompare(b.post_start || '9999')
      }
      if (sortKey === 'budget') return (b.budget || 0) - (a.budget || 0)
      return a.maker.localeCompare(b.maker)
    })
    return list
  }, [campaigns, statusFilters, sortKey])

  // KPIs
  const totalOverdue = useMemo(() => campaigns.reduce((sum, c) => sum + countOverdue(c), 0), [campaigns, countOverdue])
  const totalBudget = useMemo(() => campaigns.reduce((sum, c) => sum + (c.budget || 0), 0), [campaigns])
  const confirmedBudget = useMemo(() => campaigns.filter(c => c.certainty === '確定').reduce((sum, c) => sum + (c.budget || 0), 0), [campaigns])

  // Monthly revenue (current month) — billing_month preferred, fallback to post_end month
  const currentMonth = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])
  const monthlyRevenue = useMemo(() => {
    return campaigns.filter(c => {
      const m = c.billing_month?.slice(0, 7) || c.post_end?.slice(0, 7)
      return m === currentMonth
    }).reduce((sum, c) => sum + (c.billing_amount || c.budget || 0), 0)
  }, [campaigns, currentMonth])
  const confirmedMonthlyRevenue = useMemo(() => {
    return campaigns.filter(c => {
      const m = c.billing_month?.slice(0, 7) || c.post_end?.slice(0, 7)
      return m === currentMonth && c.certainty === '確定'
    }).reduce((sum, c) => sum + (c.billing_amount || c.budget || 0), 0)
  }, [campaigns, currentMonth])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    STATUS_LIST.forEach(s => counts[s] = 0)
    campaigns.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++ })
    return counts
  }, [campaigns])

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="全案件" value={campaigns.length.toString()} />
        {STATUS_LIST.filter(s => s !== '完了').map(s => (
          <KpiCard key={s} label={s} value={statusCounts[s].toString()} color={STATUS_COLORS[s]} />
        ))}
        <KpiCard label="対応遅延" value={totalOverdue.toString()} color={totalOverdue > 0 ? { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' } : undefined} />
      </div>

      {/* Budget & Revenue KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-3 px-4 space-y-1">
            <div>
              <span className="text-sm text-gray-500">総予算（見込み含む）: </span>
              <span className="font-bold tabular-nums">{formatCurrency(totalBudget)}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">総予算（確定のみ）: </span>
              <span className="font-bold tabular-nums text-green-700">{formatCurrency(confirmedBudget)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 space-y-1">
            <div>
              <span className="text-sm text-gray-500">今月売上（見込み含む）: </span>
              <span className="font-bold tabular-nums">{formatCurrency(monthlyRevenue)}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">今月売上（確定のみ）: </span>
              <span className="font-bold tabular-nums text-green-700">{formatCurrency(confirmedMonthlyRevenue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={statusFilters.size === 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilters(new Set())}
        >
          全て ({campaigns.length})
        </Button>
        {STATUS_LIST.map(s => (
          <Button
            key={s}
            variant={statusFilters.has(s) ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilters(prev => {
                const next = new Set(prev)
                if (next.has(s)) { next.delete(s) } else { next.add(s) }
                return next
              })
            }}
          >
            {s} ({statusCounts[s]})
          </Button>
        ))}
        <div className="ml-auto">
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="postStart">投稿開始日順</SelectItem>
              <SelectItem value="budget">予算順</SelectItem>
              <SelectItem value="maker">メーカー順</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Campaign Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-[900px] text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[120px]">メーカー</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[140px]">商品</th>
              <th className="text-center px-2 py-2 font-medium text-gray-600 w-[80px]">ステータス</th>
              <th className="text-center px-2 py-2 font-medium text-gray-600 w-[60px]">審査</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-[100px]">予算</th>
              {MS_DEFS.map(ms => (
                <th key={ms.key} className="text-center px-2 py-2 font-medium text-gray-600 w-[90px] text-xs">{ms.label.split('（')[0]}</th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(campaign => {
              const isExpanded = expandedId === campaign.id
              const overdueCount = countOverdue(campaign)
              const rowBg = STATUS_COLORS[campaign.status]?.bg || ''

              return (
                <MilestoneRow
                  key={campaign.id}
                  campaign={campaign}
                  checks={checks}
                  isExpanded={isExpanded}
                  overdueCount={overdueCount}
                  rowBg={rowBg}
                  onToggleExpand={() => setExpandedId(isExpanded ? null : campaign.id)}
                  onToggleCheck={toggleCheck}
                  onUpdateStatus={updateStatus}
                  onUpdateMemo={updateMemo}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color?: { bg: string; text: string; border: string } }) {
  return (
    <Card className={`${color?.border || ''}`}>
      <CardContent className={`py-3 px-4 ${color?.bg || ''}`}>
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-2xl font-bold ${color?.text || ''}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

interface MilestoneRowProps {
  campaign: Campaign
  checks: Record<string, boolean>
  isExpanded: boolean
  overdueCount: number
  rowBg: string
  onToggleExpand: () => void
  onToggleCheck: (campaignId: number, milestoneKey: string) => void
  onUpdateStatus: (id: number, status: string) => void
  onUpdateMemo: (id: number, memo: string) => void
}

function MilestoneRow({
  campaign, checks, isExpanded, overdueCount, rowBg,
  onToggleExpand, onToggleCheck, onUpdateStatus, onUpdateMemo,
}: MilestoneRowProps) {
  const [memo, setMemo] = useState(campaign.memo || '')

  const handleMemoChange = (value: string) => {
    setMemo(value)
    onUpdateMemo(campaign.id, value)
  }

  return (
    <>
      <tr
        className={`border-b cursor-pointer hover:bg-gray-100 transition-colors ${rowBg}`}
        onClick={onToggleExpand}
      >
        <td className="px-3 py-2 font-medium">{campaign.maker}</td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-1">
            {campaign.product}
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">
                {overdueCount}遅延
              </Badge>
            )}
          </span>
        </td>
        <td className="text-center px-2 py-2">
          <Badge className={STATUS_COLORS[campaign.status]?.text + ' ' + STATUS_COLORS[campaign.status]?.bg + ' text-[11px] px-1.5'}>
            {campaign.status}
          </Badge>
        </td>
        <td className="text-center px-2 py-2 text-xs text-gray-500">{campaign.review || '—'}</td>
        <td className="text-right px-3 py-2 tabular-nums text-xs">{formatCurrency(campaign.budget)}</td>
        {MS_DEFS.map(ms => {
          const dateStr = campaign[ms.dbCol as keyof Campaign] as string | null
          const checked = checks[`${campaign.id}-${ms.key}`] || false
          const overdue = isMilestoneOverdue(dateStr, ms.deadlineOffset, checked)

          let cellBg = ''
          let content = '—'

          if (!dateStr) {
            cellBg = 'bg-gray-50'
          } else if (checked) {
            cellBg = 'bg-green-50'
            content = '✓'
          } else if (overdue) {
            cellBg = 'bg-red-50'
            content = dateStr.slice(5)
          } else {
            content = dateStr.slice(5)
          }

          return (
            <td key={ms.key} className={`text-center px-2 py-2 text-xs ${cellBg}`} onClick={e => e.stopPropagation()}>
              <button
                className={`w-full ${checked ? 'text-green-600 font-bold' : overdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}
                onClick={() => dateStr && onToggleCheck(campaign.id, ms.key)}
                disabled={!dateStr}
              >
                {content}
              </button>
            </td>
          )
        })}
        <td className="px-1 py-2">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </td>
      </tr>

      {/* Expanded Detail */}
      {isExpanded && (
        <tr className="border-b bg-white">
          <td colSpan={13} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Details */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">予算:</span> <span className="font-medium">{formatCurrency(campaign.budget)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">再生単価:</span> <span className="font-medium">{campaign.unit_price ? `¥${campaign.unit_price}` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">必要再生回数:</span>{' '}
                    <span className="font-medium">
                      {campaign.budget && campaign.unit_price ? calcRequiredViews(campaign.budget, campaign.unit_price).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">目標投稿数:</span>{' '}
                    <span className="font-medium">
                      {campaign.budget && campaign.unit_price && campaign.avg_views
                        ? calcTargetPosts(calcRequiredViews(campaign.budget, campaign.unit_price), campaign.avg_views).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">投稿者数:</span> <span className="font-medium">{campaign.influencers || '—'}</span>
                  </div>
                  {campaign.url && (
                    <div className="col-span-2">
                      <a href={campaign.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        商品URL
                      </a>
                    </div>
                  )}
                </div>

                {/* Memo */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">メモ</label>
                  <Textarea
                    value={memo}
                    onChange={e => handleMemoChange(e.target.value)}
                    rows={3}
                    className="text-sm"
                    onClick={e => e.stopPropagation()}
                  />
                </div>

                {/* Status buttons */}
                <div className="flex flex-wrap gap-1">
                  {STATUS_LIST.map(s => (
                    <Button
                      key={s}
                      variant={campaign.status === s ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-7"
                      onClick={(e) => { e.stopPropagation(); onUpdateStatus(campaign.id, s) }}
                    >
                      {s}
                    </Button>
                  ))}
                </div>

                {/* Edit link */}
                <Link href={`/campaigns/${campaign.id}`} className="text-blue-600 hover:underline text-sm" onClick={e => e.stopPropagation()}>
                  案件詳細を編集
                </Link>
              </div>

              {/* Right: Milestone Checklist */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">マイルストーンチェックリスト</h4>
                {MS_DEFS.map(ms => {
                  const dateStr = campaign[ms.dbCol as keyof Campaign] as string | null
                  const checked = checks[`${campaign.id}-${ms.key}`] || false
                  const overdue = isMilestoneOverdue(dateStr, ms.deadlineOffset, checked)
                  const deadline = dateStr ? ms.deadlineOffset(dateStr) : null
                  const diff = deadline ? daysDiff(deadline) : null

                  return (
                    <div
                      key={ms.key}
                      className={`flex items-center gap-3 p-2 rounded border text-sm cursor-pointer ${
                        checked ? 'bg-green-50 border-green-200' : overdue ? 'bg-red-50 border-red-200' : 'border-gray-200'
                      }`}
                      onClick={(e) => { e.stopPropagation(); dateStr && onToggleCheck(campaign.id, ms.key) }}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                        {checked && <Check className="h-3 w-3" />}
                      </div>
                      <div className="flex-1">
                        <span className={checked ? 'line-through text-gray-400' : ''}>{ms.label}</span>
                        {dateStr && (
                          <span className="text-xs text-gray-400 ml-2">{dateStr}</span>
                        )}
                      </div>
                      <div className="text-xs">
                        {!dateStr ? (
                          <span className="text-gray-300">未設定</span>
                        ) : checked ? (
                          <span className="text-green-600">完了</span>
                        ) : overdue ? (
                          <span className="text-red-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {Math.abs(diff!)}日遅延
                          </span>
                        ) : diff !== null && diff <= 3 ? (
                          <span className="text-orange-600">あと{diff}日</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
