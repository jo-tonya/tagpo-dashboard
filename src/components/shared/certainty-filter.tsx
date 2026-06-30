'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

// 確度フィルタ共通部品。
// 月次PL（pl-summary-table）と同じ 6 値・同じ操作感（トグル + 全選択/失注以外/クリア）を
// 案件一覧の確度ソート、事業収入・事業コストの確度別表示でも使い回すための共通化。

export const ALL_CERTAINTY = ['A.完了', 'B.進行中', 'C.受注確定', 'D.見込み+', 'E.見込み-', 'F.失注'] as const
export type Certainty = typeof ALL_CERTAINTY[number]

// §18: F.失注 を除いた集合をデフォルト ON にする（失注は売上/原価から除外したい）
export const DEFAULT_CERTAINTY: readonly Certainty[] = ALL_CERTAINTY.filter(c => c !== 'F.失注')

// 確度ソート用の優先度（A→F の順）。不明値は最後尾。
export const CERTAINTY_RANK: Record<string, number> =
  ALL_CERTAINTY.reduce<Record<string, number>>((acc, c, i) => { acc[c] = i; return acc }, {})

// 旧文字列（'確定'/'見込み'/'未確定'）を 6 値へ正規化。不明値は null（フィルタから除外）。
export function normalizeCertainty(raw: string | null | undefined): Certainty | null {
  if (raw && (ALL_CERTAINTY as readonly string[]).includes(raw)) return raw as Certainty
  if (raw === '確定') return 'A.完了'
  if (raw === '見込み') return 'B.進行中'
  if (raw === '未確定') return 'D.見込み+'
  return null
}

// ボタン選択時の色（確度別）。pl-summary-table と統一。
const CERTAINTY_BTN_COLOR: Record<Certainty, string> = {
  'A.完了':    'bg-emerald-600 hover:bg-emerald-700',
  'B.進行中':  'bg-blue-600 hover:bg-blue-700',
  'C.受注確定': 'bg-violet-600 hover:bg-violet-700',
  'D.見込み+': 'bg-amber-500 hover:bg-amber-600',
  'E.見込み-': 'bg-zinc-400 hover:bg-zinc-500',
  'F.失注':    'bg-red-700 hover:bg-red-800',
}

export interface CertaintyFilter {
  certaintySet: Set<Certainty>
  setCertaintySet: (s: Set<Certainty>) => void
  toggle: (c: Certainty) => void
  /** 生の確度文字列が現在の選択集合に含まれるか（旧値も正規化して判定） */
  matches: (raw: string | null | undefined) => boolean
}

// 確度フィルタの状態管理フック。初期は「失注以外（A〜E）」。
export function useCertaintyFilter(initial: readonly Certainty[] = DEFAULT_CERTAINTY): CertaintyFilter {
  const [certaintySet, setCertaintySet] = useState<Set<Certainty>>(() => new Set(initial))

  const toggle = (c: Certainty) =>
    setCertaintySet(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  const matches = useMemo(() => {
    return (raw: string | null | undefined) => {
      const c = normalizeCertainty(raw)
      return c !== null && certaintySet.has(c)
    }
  }, [certaintySet])

  return { certaintySet, setCertaintySet, toggle, matches }
}

// 確度トグルバー（pl-summary-table と同じ操作感）
export function CertaintyFilterBar({ filter }: { filter: CertaintyFilter }) {
  const { certaintySet, setCertaintySet, toggle } = filter

  const isAllSelected = certaintySet.size === ALL_CERTAINTY.length
  const isNoneSelected = certaintySet.size === 0
  const isDefaultSelected = certaintySet.size === DEFAULT_CERTAINTY.length
    && DEFAULT_CERTAINTY.every(c => certaintySet.has(c))

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium whitespace-nowrap">確度</span>
      <div className="flex gap-1.5 flex-wrap">
        {ALL_CERTAINTY.map(c => {
          const active = certaintySet.has(c)
          return (
            <Button
              key={c}
              size="sm"
              variant={active ? 'default' : 'outline'}
              className={active ? CERTAINTY_BTN_COLOR[c] : ''}
              onClick={() => toggle(c)}
            >
              {c}
            </Button>
          )
        })}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setCertaintySet(new Set(ALL_CERTAINTY))} disabled={isAllSelected}>
          全選択
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCertaintySet(new Set(DEFAULT_CERTAINTY))} disabled={isDefaultSelected}>
          失注以外
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCertaintySet(new Set())} disabled={isNoneSelected}>
          クリア
        </Button>
      </div>
    </div>
  )
}
