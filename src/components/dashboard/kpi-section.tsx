'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KpiActuals, KpiAction, KpiMetricKey } from '@/lib/types'
import { formatCurrency, formatMonth, formatNumber } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Fmt = 'money' | 'count' | 'percent'

interface MetricDef {
  key: KpiMetricKey
  label: string
  fmt: Fmt
}

const SALES_METRICS: MetricDef[] = [
  { key: 'adinte_revenue', label: 'アドインテからの売上', fmt: 'money' },
  { key: 'adinte_count', label: 'アドインテからの案件数', fmt: 'count' },
  { key: 'new_agency_kinds', label: '新規代理店数', fmt: 'count' },
  { key: 'new_agency_revenue', label: '新規代理店からの売上', fmt: 'money' },
  { key: 'new_agency_deals', label: '新規代理店からの案件数', fmt: 'count' },
  { key: 'own_revenue', label: '自社チャネルの売上', fmt: 'money' },
  { key: 'own_count', label: '自社チャネルの案件数', fmt: 'count' },
]

const USER_METRICS: MetricDef[] = [
  { key: 'user_count', label: 'ユーザー数', fmt: 'count' },
  { key: 'active_rate', label: 'アクティブ率', fmt: 'percent' },
  { key: 'active_user_count', label: 'アクティブユーザー数', fmt: 'count' },
]

interface KpiSectionProps {
  months: string[]
  actuals: KpiActuals
  manualValues: Record<string, number>  // `${month}|${metric_key}|${kind}` → value
  actions: KpiAction[]
}

// 表示用フォーマット（0 や未入力は '—'）
function fmtDisplay(v: number | undefined, fmt: Fmt): string {
  if (v == null || v === 0) return '—'
  if (fmt === 'money') return formatCurrency(v)
  if (fmt === 'percent') return `${(v * 100).toFixed(1)}%`
  return formatNumber(v)
}

export function KpiSection({ months, actuals, manualValues, actions }: KpiSectionProps) {
  return (
    <div className="space-y-4">
      <KpiMatrix months={months} actuals={actuals} manualValues={manualValues} />
      <KpiActionsBlock months={months} actions={actions} />
    </div>
  )
}

// ───────── KPI マトリクス ─────────
function KpiMatrix({
  months,
  actuals,
  manualValues,
}: {
  months: string[]
  actuals: KpiActuals
  manualValues: Record<string, number>
}) {
  // 手入力の編集バッファ。キー `${month}|${metric_key}|${kind}` → 入力文字列
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // 入力欄のベースライン文字列（DB 値）
  function baseline(month: string, key: KpiMetricKey, kind: 'target' | 'actual', fmt: Fmt): string {
    const v = manualValues[`${month}|${key}|${kind}`]
    if (v == null) return ''
    if (fmt === 'percent') return String(Math.round(v * 10000) / 100)
    return String(v)
  }

  function inputVal(month: string, key: KpiMetricKey, kind: 'target' | 'actual', fmt: Fmt): string {
    const ek = `${month}|${key}|${kind}`
    return edits[ek] ?? baseline(month, key, kind, fmt)
  }

  function setVal(month: string, key: KpiMetricKey, kind: 'target' | 'actual', raw: string) {
    setEdits(prev => ({ ...prev, [`${month}|${key}|${kind}`]: raw }))
  }

  const dirtyKeys = useMemo(() => {
    const all = [...SALES_METRICS, ...USER_METRICS]
    const fmtOf: Record<string, Fmt> = {}
    for (const m of all) fmtOf[m.key] = m.fmt
    return Object.keys(edits).filter(ek => {
      const [month, key, kind] = ek.split('|')
      return edits[ek] !== baseline(month, key as KpiMetricKey, kind as 'target' | 'actual', fmtOf[key])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, manualValues])

  async function saveAll() {
    if (dirtyKeys.length === 0) {
      toast.info('変更はありません')
      return
    }
    setSaving(true)
    try {
      const fmtOf: Record<string, Fmt> = {}
      for (const m of [...SALES_METRICS, ...USER_METRICS]) fmtOf[m.key] = m.fmt
      let ok = 0
      for (const ek of dirtyKeys) {
        const [month, key, kind] = ek.split('|')
        const raw = edits[ek]
        const parsed = parseFloat(raw)
        const value = isNaN(parsed) ? 0 : fmtOf[key] === 'percent' ? parsed / 100 : parsed
        const res = await fetch('/api/kpi/values', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, metric_key: key, kind, value }),
        })
        if (res.ok) ok++
      }
      if (ok === dirtyKeys.length) {
        toast.success(`${ok}件保存しました`)
        setEdits({})
      } else {
        toast.error(`${ok}/${dirtyKeys.length}件のみ保存`)
      }
    } finally {
      setSaving(false)
    }
  }

  // 入力セル
  function targetCell(month: string, m: MetricDef) {
    if (m.fmt === 'percent') {
      return (
        <Input
          type="text"
          inputMode="decimal"
          className="h-7 w-24 text-right text-xs tabular-nums"
          value={inputVal(month, m.key, 'target', m.fmt)}
          onChange={e => {
            const raw = e.target.value
            if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setVal(month, m.key, 'target', raw)
          }}
          placeholder="%"
        />
      )
    }
    return (
      <NumericInput
        className="h-7 w-28 text-right text-xs tabular-nums"
        value={inputVal(month, m.key, 'target', m.fmt)}
        onChange={v => setVal(month, m.key, 'target', v)}
        integerOnly
      />
    )
  }

  function actualInputCell(month: string, m: MetricDef) {
    if (m.fmt === 'percent') {
      return (
        <Input
          type="text"
          inputMode="decimal"
          className="h-7 w-24 text-right text-xs tabular-nums"
          value={inputVal(month, m.key, 'actual', m.fmt)}
          onChange={e => {
            const raw = e.target.value
            if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setVal(month, m.key, 'actual', raw)
          }}
          placeholder="%"
        />
      )
    }
    return (
      <NumericInput
        className="h-7 w-28 text-right text-xs tabular-nums"
        value={inputVal(month, m.key, 'actual', m.fmt)}
        onChange={v => setVal(month, m.key, 'actual', v)}
        integerOnly
      />
    )
  }

  // 左 2 列は横スクロール時に固定。幅を固定し、ラベルは折り返さない（縦に伸びるのを防ぐ）。
  // stickyB の left は stickyA(指標) の幅と一致させる。
  const stickyA = 'sticky left-0 z-10 bg-white whitespace-nowrap'
  const stickyB = 'sticky left-[160px] z-10 bg-white whitespace-nowrap'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">目標・KPI</CardTitle>
            <p className="mt-1 text-xs text-gray-500">
              現時点の数値（実績）は案件データからリアルタイム算出／月の帰属＝再生完了月（請求月）。
              確定＝確度C以上、未確定＝D・E（失注は除外）。目標とユーザー系の現時点は手入力。
            </p>
          </div>
          <Button
            onClick={saveAll}
            disabled={saving || dirtyKeys.length === 0}
            className="bg-blue-600 hover:bg-blue-700 shrink-0"
            size="sm"
          >
            {saving ? '保存中...' : dirtyKeys.length > 0 ? `変更を保存（${dirtyKeys.length}件）` : '保存'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b">
              <th className={`${stickyA} w-[160px] min-w-[160px] px-3 py-2 text-left font-medium`}>指標</th>
              <th className={`${stickyB} w-[120px] min-w-[120px] px-3 py-2 text-left font-medium`}>区分</th>
              {months.map(month => (
                <th key={month} className="min-w-[110px] px-3 py-2 text-right font-medium whitespace-nowrap">
                  {formatMonth(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Tagpo セールス */}
            <tr className="bg-blue-50">
              <td className={`${stickyA} bg-blue-50 px-2 py-1.5 font-semibold text-blue-800`} colSpan={2}>
                Tagpo セールス
              </td>
              <td className="bg-blue-50" colSpan={months.length} />
            </tr>
            {SALES_METRICS.map(m => (
              <SalesMetricRows
                key={m.key}
                m={m}
                months={months}
                actuals={actuals}
                targetCell={targetCell}
                stickyA={stickyA}
                stickyB={stickyB}
              />
            ))}

            {/* Tagpo ユーザー */}
            <tr className="bg-emerald-50">
              <td className={`${stickyA} bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800`} colSpan={2}>
                Tagpo ユーザー
              </td>
              <td className="bg-emerald-50" colSpan={months.length} />
            </tr>
            {USER_METRICS.map(m => (
              <UserMetricRows
                key={m.key}
                m={m}
                months={months}
                actualInputCell={actualInputCell}
                targetCell={targetCell}
                stickyA={stickyA}
                stickyB={stickyB}
              />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// 売上系メトリクスの3行（現時点 確定／未確定／目標）
function SalesMetricRows({
  m,
  months,
  actuals,
  targetCell,
  stickyA,
  stickyB,
}: {
  m: MetricDef
  months: string[]
  actuals: KpiActuals
  targetCell: (month: string, m: MetricDef) => React.ReactNode
  stickyA: string
  stickyB: string
}) {
  return (
    <>
      <tr className="border-b border-gray-100">
        <td className={`${stickyA} px-2 py-1 align-middle font-medium`} rowSpan={3}>
          {m.label}
        </td>
        <td className={`${stickyB} px-2 py-1 text-gray-600`}>現時点（確定）</td>
        {months.map(month => (
          <td key={month} className="px-2 py-1 text-right tabular-nums">
            {fmtDisplay(actuals[month]?.[m.key]?.confirmed, m.fmt)}
          </td>
        ))}
      </tr>
      <tr className="border-b border-gray-100">
        <td className={`${stickyB} px-2 py-1 text-gray-400`}>現時点（未確定）</td>
        {months.map(month => (
          <td key={month} className="px-2 py-1 text-right tabular-nums text-gray-500">
            {fmtDisplay(actuals[month]?.[m.key]?.unconfirmed, m.fmt)}
          </td>
        ))}
      </tr>
      <tr className="border-b">
        <td className={`${stickyB} px-2 py-1 text-gray-600`}>目標</td>
        {months.map(month => (
          <td key={month} className="px-2 py-1 text-right">
            {targetCell(month, m)}
          </td>
        ))}
      </tr>
    </>
  )
}

// ユーザー系メトリクスの2行（現時点〔手入力〕／目標）
function UserMetricRows({
  m,
  months,
  actualInputCell,
  targetCell,
  stickyA,
  stickyB,
}: {
  m: MetricDef
  months: string[]
  actualInputCell: (month: string, m: MetricDef) => React.ReactNode
  targetCell: (month: string, m: MetricDef) => React.ReactNode
  stickyA: string
  stickyB: string
}) {
  return (
    <>
      <tr className="border-b border-gray-100">
        <td className={`${stickyA} px-2 py-1 align-middle font-medium`} rowSpan={2}>
          {m.label}
        </td>
        <td className={`${stickyB} px-2 py-1 text-gray-600`}>現時点</td>
        {months.map(month => (
          <td key={month} className="px-2 py-1 text-right">
            {actualInputCell(month, m)}
          </td>
        ))}
      </tr>
      <tr className="border-b">
        <td className={`${stickyB} px-2 py-1 text-gray-600`}>目標</td>
        {months.map(month => (
          <td key={month} className="px-2 py-1 text-right">
            {targetCell(month, m)}
          </td>
        ))}
      </tr>
    </>
  )
}

// ───────── 重要アクション（月ごとのチェックリスト） ─────────
function KpiActionsBlock({ months, actions }: { months: string[]; actions: KpiAction[] }) {
  const router = useRouter()
  const today = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const defaultMonth = months.includes(curMonth) ? curMonth : months[months.length - 1]
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth)

  // ローカル編集用ステート。router.refresh() 後に props が変わったらレンダー中に同期する
  // （React 推奨パターン: https://react.dev/reference/react/useState#storing-information-from-previous-renders）
  const [list, setList] = useState<KpiAction[]>(actions)
  const [prevActions, setPrevActions] = useState<KpiAction[]>(actions)
  if (actions !== prevActions) {
    setPrevActions(actions)
    setList(actions)
  }

  const monthActions = list.filter(a => a.month === selectedMonth).sort((a, b) => a.sort_order - b.sort_order)

  async function toggle(a: KpiAction) {
    const next = !a.checked
    setList(prev => prev.map(x => (x.id === a.id ? { ...x, checked: next } : x)))
    const res = await fetch('/api/kpi/actions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, checked: next }),
    })
    if (!res.ok) {
      toast.error('更新に失敗しました')
      setList(prev => prev.map(x => (x.id === a.id ? { ...x, checked: a.checked } : x)))
    }
  }

  function editText(id: string, text: string) {
    setList(prev => prev.map(x => (x.id === id ? { ...x, text } : x)))
  }

  async function saveText(a: KpiAction) {
    const res = await fetch('/api/kpi/actions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, text: a.text }),
    })
    if (!res.ok) toast.error('保存に失敗しました')
  }

  async function addAction() {
    const sort = monthActions.length
    const res = await fetch('/api/kpi/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: selectedMonth, text: '', sort_order: sort }),
    })
    if (res.ok) router.refresh()
    else toast.error('追加に失敗しました')
  }

  async function removeAction(id: string) {
    setList(prev => prev.filter(x => x.id !== id))
    const res = await fetch('/api/kpi/actions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      toast.error('削除に失敗しました')
      router.refresh()
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">重要アクション</CardTitle>
          <select
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          >
            {months.map(month => (
              <option key={month} value={month}>
                {formatMonth(month)}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {monthActions.length === 0 && (
          <p className="text-sm text-gray-400">アクションはまだありません。</p>
        )}
        {monthActions.map(a => (
          <div key={a.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={a.checked}
              onChange={() => toggle(a)}
              className="h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
            />
            <Input
              type="text"
              value={a.text}
              onChange={e => editText(a.id, e.target.value)}
              onBlur={() => saveText(a)}
              placeholder="アクションを入力"
              className={
                a.checked
                  ? 'h-8 text-sm text-gray-400 line-through'
                  : 'h-8 text-sm'
              }
            />
            <button
              type="button"
              onClick={() => removeAction(a.id)}
              className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              aria-label="削除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button onClick={addAction} variant="outline" size="sm" className="mt-1">
          <Plus className="mr-1 h-4 w-4" />
          アクションを追加
        </Button>
      </CardContent>
    </Card>
  )
}
