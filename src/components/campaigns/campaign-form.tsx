'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Campaign, CampaignSubcontract, campaignDisplayName } from '@/lib/types'
import { calcRevenue, calcGuaranteedViews, calcSelfRevenue, calcRequiredViews, calcTargetPosts, formatCurrency, formatPercent, formatNumber } from '@/lib/calculations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Save, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

// Numeric input that displays with commas but stores raw number string
function NumericInput({ value, onChange, step, readOnly, className, ...props }: {
  value: string; onChange?: (val: string) => void; step?: string; readOnly?: boolean; className?: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false)
  const displayValue = (!focused && value) ? Number(value).toLocaleString('ja-JP') : value
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '')
        if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) onChange?.(raw)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      readOnly={readOnly}
      className={className}
      {...props}
    />
  )
}

interface CampaignFormProps {
  campaign?: Campaign
  subcontracts?: CampaignSubcontract[]
  initialAdDeliveryAmount?: number | null
  mode: 'create' | 'edit'
}

const STATUS_OPTIONS = ['未確定', 'シート回収済み', '進行中', '投稿中', '完了']
const TYPE_OPTIONS = ['既存', '新商品']

const statusColors: Record<string, string> = {
  '未確定': 'bg-gray-100 text-gray-600',
  'シート回収済み': 'bg-orange-100 text-orange-700',
  '進行中': 'bg-blue-100 text-blue-700',
  '投稿中': 'bg-purple-100 text-purple-700',
  '完了': 'bg-green-100 text-green-700',
}

interface SubcontractEntry {
  sort_order: number
  company_name: string
  delegated_amount: string
  delegated_revenue: string
  notes: string
}

export function CampaignForm({ campaign, subcontracts: initialSubs, initialAdDeliveryAmount, mode }: CampaignFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Basic info
  const [form, setForm] = useState({
    maker: campaign?.maker || '',
    product: campaign?.product || '',
    status: campaign?.status || '未確定',
    certainty: campaign?.certainty || '未確定',
    type: campaign?.type || '既存',
    review: campaign?.review || '',
    url: campaign?.url || '',
    influencers: campaign?.influencers || '',
    memo: campaign?.memo || '',
    // PL
    retail_margin: campaign?.retail_margin != null ? (campaign.retail_margin * 100).toString() : '',
    agency_margin: campaign?.agency_margin != null ? (campaign.agency_margin * 100).toString() : '',
    product_unit_price: campaign?.product_unit_price?.toString() || '',
    review_unit_price: campaign?.review_unit_price?.toString() || '',
    user_reward_unit_price: campaign?.user_reward_unit_price?.toString() || '',
    user_reward_amount: campaign?.user_reward_amount?.toString() || '',
    ad_delivery_amount: initialAdDeliveryAmount != null ? initialAdDeliveryAmount.toString() : '',
    // Budget
    budget: campaign?.budget?.toString() || '',
    unit_price: campaign?.unit_price?.toString() || '',
    avg_views: campaign?.avg_views?.toString() || '',
  })

  // Milestones
  const [milestones, setMilestones] = useState({
    es_collection: campaign?.es_collection || '',
    info_release: campaign?.info_release || '',
    post_start: campaign?.post_start || '',
    post_end: campaign?.post_end || '',
    view_complete: campaign?.view_complete || '',
    report_send: campaign?.report_send || '',
  })

  // Subcontracts
  const [subs, setSubs] = useState<SubcontractEntry[]>(
    initialSubs && initialSubs.length > 0
      ? initialSubs.map(s => ({
          sort_order: s.sort_order,
          company_name: s.company_name,
          delegated_amount: s.delegated_amount.toString(),
          delegated_revenue: s.delegated_revenue.toString(),
          notes: s.notes || '',
        }))
      : []
  )

  // === Auto calculations ===
  const budget = parseFloat(form.budget) || 0
  const unitPrice = parseFloat(form.unit_price) || 0
  const avgViews = parseFloat(form.avg_views) || 0
  const retailM = (parseFloat(form.retail_margin) || 0) / 100
  const agencyM = (parseFloat(form.agency_margin) || 0) / 100

  const requiredViews = useMemo(() => budget > 0 && unitPrice > 0 ? calcRequiredViews(budget, unitPrice) : 0, [budget, unitPrice])
  const targetPosts = useMemo(() => requiredViews > 0 && avgViews > 0 ? calcTargetPosts(requiredViews, avgViews) : 0, [requiredViews, avgViews])
  const guaranteedViews = useMemo(() => budget > 0 && unitPrice > 0 ? calcGuaranteedViews(budget, unitPrice) : 0, [budget, unitPrice])
  const computedRevenue = useMemo(() => budget > 0 ? calcRevenue(budget, retailM, agencyM) : 0, [budget, retailM, agencyM])
  const userRewardUnitPrice = parseFloat(form.user_reward_unit_price) || 0
  const rewardAutoCalc = useMemo(() => requiredViews > 0 && userRewardUnitPrice > 0 ? Math.round(requiredViews * userRewardUnitPrice) : 0, [requiredViews, userRewardUnitPrice])

  const subDelegatedRevenue = useMemo(
    () => subs.map(s => ({ delegatedRevenue: parseFloat(s.delegated_revenue) || 0 })),
    [subs]
  )
  const selfRevenue = useMemo(() => calcSelfRevenue(computedRevenue, subDelegatedRevenue), [computedRevenue, subDelegatedRevenue])
  const grossMarginRate = budget > 0 ? selfRevenue / budget : 0

  // Subcontract handlers
  function addSubcontract() {
    if (subs.length >= 3) return
    setSubs([...subs, {
      sort_order: subs.length + 1,
      company_name: '',
      delegated_amount: '',
      delegated_revenue: '',
      notes: '',
    }])
  }

  function removeSubcontract(idx: number) {
    setSubs(subs.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sort_order: i + 1 })))
  }

  function updateSub(idx: number, field: keyof SubcontractEntry, value: string) {
    setSubs(subs.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.maker.trim() || !form.product.trim()) {
      toast.error('メーカー名と商品名は必須です')
      return
    }

    setSaving(true)
    try {
      const campaignData = {
        maker: form.maker,
        product: form.product,
        status: form.status,
        certainty: form.certainty,
        type: form.type,
        review: form.review,
        url: form.url,
        influencers: form.influencers,
        memo: form.memo,
        budget: form.budget ? parseFloat(form.budget) : null,
        unit_price: form.unit_price ? parseFloat(form.unit_price) : null,
        avg_views: form.avg_views ? parseFloat(form.avg_views) : null,
        // Milestones
        es_collection: milestones.es_collection || null,
        info_release: milestones.info_release || null,
        post_start: milestones.post_start || null,
        post_end: milestones.post_end || null,
        view_complete: milestones.view_complete || null,
        report_send: milestones.report_send || null,
        // PL
        billing_amount: computedRevenue > 0 ? Math.round(computedRevenue) : null,
        retail_margin: form.retail_margin ? parseFloat(form.retail_margin) / 100 : null,
        agency_margin: form.agency_margin ? parseFloat(form.agency_margin) / 100 : null,
        product_unit_price: form.product_unit_price ? parseFloat(form.product_unit_price) : null,
        review_unit_price: form.review_unit_price ? parseFloat(form.review_unit_price) : null,
        user_reward_unit_price: form.user_reward_unit_price ? parseFloat(form.user_reward_unit_price) : null,
        user_reward_amount: form.user_reward_amount ? parseFloat(form.user_reward_amount) : null,
        // Subcontracts
        subcontracts: subs.filter(s => s.company_name.trim()).map(s => ({
          sort_order: s.sort_order,
          company_name: s.company_name,
          delegated_amount: parseFloat(s.delegated_amount) || 0,
          delegated_revenue: parseFloat(s.delegated_revenue) || 0,
          notes: s.notes || null,
        })),
      }

      if (mode === 'create') {
        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(campaignData),
        })
        if (res.ok) {
          const data = await res.json()
          const rewardAmount = form.user_reward_amount ? parseFloat(form.user_reward_amount) : null
          const adAmount = form.ad_delivery_amount ? parseFloat(form.ad_delivery_amount) : null
          await Promise.all([
            fetch(`/api/campaigns/${data.id}/sync-reward-cost`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: rewardAmount }),
            }),
            fetch(`/api/campaigns/${data.id}/sync-ad-delivery-cost`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: adAmount }),
            }),
          ])
          toast.success('案件を作成しました')
          router.push(`/campaigns/${data.id}`)
        } else {
          toast.error('作成に失敗しました')
        }
      } else {
        const res = await fetch(`/api/campaigns/${campaign!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(campaignData),
        })
        if (res.ok) {
          await Promise.all([
            fetch(`/api/campaigns/${campaign!.id}/sync-reward-cost`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: form.user_reward_amount ? parseFloat(form.user_reward_amount) : null }),
            }),
            fetch(`/api/campaigns/${campaign!.id}/sync-ad-delivery-cost`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: form.ad_delivery_amount ? parseFloat(form.ad_delivery_amount) : null }),
            }),
          ])
          toast.success('保存しました')
          router.refresh()
        } else {
          toast.error('保存に失敗しました')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!campaign || !confirm('この案件を削除しますか？')) return
    const res = await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('削除しました')
      router.push('/campaigns')
    } else {
      toast.error('削除に失敗しました')
    }
  }

  const displayName = campaign ? campaignDisplayName(campaign) : '新規案件'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
          <h1 className="text-2xl font-bold">
            {mode === 'create' ? '新規案件作成' : displayName}
          </h1>
          {campaign && (
            <Badge className={statusColors[campaign.status] || 'bg-gray-100'}>
              {campaign.status}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {mode === 'edit' && (
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1 h-4 w-4" />
              削除
            </Button>
          )}
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Certainty Selector */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-600">確度:</span>
        {(['未確定', '見込み', '確定'] as const).map(c => (
          <Button
            key={c}
            type="button"
            size="sm"
            variant={form.certainty === c ? 'default' : 'outline'}
            className={form.certainty === c
              ? c === '確定' ? 'bg-green-600 hover:bg-green-700' : c === '見込み' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-500 hover:bg-gray-600'
              : ''}
            onClick={() => setForm(p => ({ ...p, certainty: c }))}
          >
            {c}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Basic Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">基本情報</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={form.status} onValueChange={v => v && setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>メーカー名 *</Label>
                <Input value={form.maker} onChange={e => setForm(p => ({ ...p, maker: e.target.value }))} placeholder="農心ジャパン" required />
              </div>
              <div className="space-y-2">
                <Label>商品名 *</Label>
                <Input value={form.product} onChange={e => setForm(p => ({ ...p, product: e.target.value }))} placeholder="辛ラーメン トゥーンバ" required />
              </div>
              <div className="space-y-2">
                <Label>種別</Label>
                <Select value={form.type} onValueChange={v => v && setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>審査</Label>
                <Input value={form.review} onChange={e => setForm(p => ({ ...p, review: e.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>商品URL</Label>
                <Input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..." />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Milestones */}
          <Card>
            <CardHeader><CardTitle className="text-base">マイルストーン日程</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { key: 'es_collection', label: 'ES回収' },
                { key: 'info_release', label: '情報解禁' },
                { key: 'post_start', label: '投稿開始' },
                { key: 'post_end', label: '投稿期限' },
                { key: 'view_complete', label: '再生完了' },
                { key: 'report_send', label: 'レポート送付' },
              ].map(ms => (
                <div key={ms.key} className="space-y-2">
                  <Label>{ms.label}</Label>
                  <Input
                    type="date"
                    value={milestones[ms.key as keyof typeof milestones]}
                    onChange={e => setMilestones(p => ({ ...p, [ms.key]: e.target.value }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 3: Budget & PL */}
          <Card>
            <CardHeader><CardTitle className="text-base">予算・PL情報</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>A 予算（円）</Label>
                <NumericInput value={form.budget} onChange={v => setForm(p => ({ ...p, budget: v }))} />
              </div>
              <div className="space-y-2">
                <Label>B 再生単価</Label>
                <NumericInput value={form.unit_price} onChange={v => setForm(p => ({ ...p, unit_price: v }))} />
              </div>
              <div className="space-y-2">
                <Label>C 平均再生</Label>
                <NumericInput value={form.avg_views} onChange={v => setForm(p => ({ ...p, avg_views: v }))} />
              </div>
              <div className="space-y-2">
                <Label>X 必要再生回数</Label>
                <Input type="text" value={requiredViews > 0 ? formatNumber(requiredViews) : ''} readOnly className="bg-gray-100" />
              </div>
              <div className="space-y-2">
                <Label>Y 目標投稿数</Label>
                <Input type="text" value={targetPosts > 0 ? formatNumber(targetPosts) : ''} readOnly className="bg-gray-100" />
              </div>
              <div className="space-y-2">
                <Label>保証再生回数</Label>
                <Input type="text" value={guaranteedViews > 0 ? Math.floor(guaranteedViews).toLocaleString() : ''} readOnly className="bg-gray-100" />
              </div>
              <div className="space-y-2">
                <Label>小売マージン（%）</Label>
                <NumericInput value={form.retail_margin} onChange={v => setForm(p => ({ ...p, retail_margin: v }))} />
              </div>
              <div className="space-y-2">
                <Label>代理店マージン（%）</Label>
                <NumericInput value={form.agency_margin} onChange={v => setForm(p => ({ ...p, agency_margin: v }))} />
              </div>
              <div className="space-y-2">
                <Label>売上（自動）</Label>
                <Input type="text" value={computedRevenue > 0 ? formatCurrency(Math.round(computedRevenue)) : ''} readOnly className="bg-gray-100" />
                <p className="text-xs text-orange-600">※ PL に反映させるには「再生完了」日の入力が必要です（再生完了月＝請求月として扱われます）</p>
              </div>
              <div className="space-y-2">
                <Label>投稿者数</Label>
                <Input value={form.influencers} onChange={e => setForm(p => ({ ...p, influencers: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>商品単価</Label>
                <NumericInput value={form.product_unit_price} onChange={v => setForm(p => ({ ...p, product_unit_price: v }))} />
              </div>
              <div className="space-y-2">
                <Label>審査単価</Label>
                <NumericInput value={form.review_unit_price} onChange={v => setForm(p => ({ ...p, review_unit_price: v }))} />
              </div>
              <div className="space-y-2">
                <Label>ユーザー報酬単価</Label>
                <NumericInput value={form.user_reward_unit_price} onChange={v => setForm(p => ({ ...p, user_reward_unit_price: v }))} />
              </div>
              <div className="space-y-2">
                <Label>ユーザー報酬額（自動 or 手動）</Label>
                <NumericInput value={form.user_reward_amount} onChange={v => setForm(p => ({ ...p, user_reward_amount: v }))} placeholder={rewardAutoCalc > 0 ? `自動: ${formatCurrency(rewardAutoCalc)}` : ''} />
                <p className="text-xs text-gray-400">
                  空欄 = 必要再生回数({formatNumber(requiredViews)}) × 報酬単価(¥{form.user_reward_unit_price || '—'}) で自動算出
                </p>
              </div>
              <div className="space-y-2">
                <Label>広告配信費</Label>
                <NumericInput value={form.ad_delivery_amount} onChange={v => setForm(p => ({ ...p, ad_delivery_amount: v }))} />
                <p className="text-xs text-gray-400">
                  PL の「広告配信費」行に再生完了月で計上されます
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Subcontracts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">外注管理（最大3社）</CardTitle>
                {subs.length < 3 && (
                  <Button type="button" variant="outline" size="sm" onClick={addSubcontract}>
                    <Plus className="mr-1 h-4 w-4" />
                    外注先を追加
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {subs.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">外注先はまだ登録されていません</p>
              )}
              {subs.map((sub, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">外注先 {idx + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeSubcontract(idx)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">企業名</Label>
                      <Input value={sub.company_name} onChange={e => updateSub(idx, 'company_name', e.target.value)} placeholder="YMS等" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">委託金額</Label>
                      <Input type="number" value={sub.delegated_amount} onChange={e => updateSub(idx, 'delegated_amount', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">委託分売上</Label>
                      <Input type="number" value={sub.delegated_revenue} onChange={e => updateSub(idx, 'delegated_revenue', e.target.value)} />
                    </div>
                    <div className="space-y-1 col-span-2 md:col-span-4">
                      <Label className="text-xs">備考</Label>
                      <Input value={sub.notes} onChange={e => updateSub(idx, 'notes', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              {subs.length > 0 && (
                <div className="bg-gray-50 rounded p-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">自社売上</span><span className="font-medium">{formatCurrency(selfRevenue || null)}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 5: Memo */}
          <Card>
            <CardHeader><CardTitle className="text-base">メモ</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={form.memo}
                onChange={e => setForm(p => ({ ...p, memo: e.target.value }))}
                rows={4}
                placeholder="自由記入欄..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Gross Profit Summary */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader><CardTitle className="text-base">粗利サマリー</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">予算</span>
                <span className="font-medium tabular-nums">{formatCurrency(budget || null)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">売上（自動）</span>
                <span className="font-medium tabular-nums">{formatCurrency(computedRevenue || null)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">自社売上</span>
                <span className="font-medium tabular-nums">{formatCurrency(selfRevenue || null)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">小売マージン</span>
                <span className="tabular-nums">{form.retail_margin ? `${form.retail_margin}%` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">代理店マージン</span>
                <span className="tabular-nums">{form.agency_margin ? `${form.agency_margin}%` : '—'}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between text-sm font-bold">
                  <span>粗利率</span>
                  <span className={`tabular-nums ${grossMarginRate > 0 ? 'text-green-700' : grossMarginRate < 0 ? 'text-red-600' : ''}`}>
                    {budget > 0 ? formatPercent(grossMarginRate) : '—'}
                  </span>
                </div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>必要再生回数 (X)</span>
                  <span className="tabular-nums">{requiredViews > 0 ? formatNumber(requiredViews) : '—'}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>目標投稿数 (Y)</span>
                  <span className="tabular-nums">{targetPosts > 0 ? formatNumber(targetPosts) : '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
