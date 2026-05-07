'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Campaign, CampaignSubcontract, campaignDisplayName } from '@/lib/types'
import { calcGuaranteedViews, calcRequiredViews, calcTargetPosts, calcCampaignProfit, formatCurrency, formatPercent, formatNumber } from '@/lib/calculations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { NumericInput } from '@/components/ui/numeric-input'
import { Save, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface CampaignFormProps {
  campaign?: Campaign
  subcontracts?: CampaignSubcontract[]
  initialAdDeliveryAmount?: number | null
  initialMiscAmount?: number | null
  mode: 'create' | 'edit'
}

// 規定値（フォームの placeholder & 計算 fallback）
const DEFAULT_REVIEW_UNIT_PRICE = 1000      // 投稿人数 × 1,000円
const DEFAULT_USER_REWARD_UNIT_PRICE = 0.4  // 必要再生回数 × 0.4円

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

export function CampaignForm({ campaign, subcontracts: initialSubs, initialAdDeliveryAmount, initialMiscAmount, mode }: CampaignFormProps) {
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
    review_unit_price: campaign?.review_unit_price?.toString() || '',
    user_reward_unit_price: campaign?.user_reward_unit_price?.toString() || '',
    user_reward_amount: campaign?.user_reward_amount?.toString() || '',
    ad_delivery_amount: initialAdDeliveryAmount != null ? initialAdDeliveryAmount.toString() : '',
    misc_amount: initialMiscAmount != null ? initialMiscAmount.toString() : '',
    posters_count: campaign?.posters_count?.toString() || '',
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

  // === Auto calculations (v3: 売上=予算モデル) ===
  const budget = parseFloat(form.budget) || 0
  const unitPrice = parseFloat(form.unit_price) || 0
  const avgViews = parseFloat(form.avg_views) || 0

  const requiredViews = useMemo(() => budget > 0 && unitPrice > 0 ? calcRequiredViews(budget, unitPrice) : 0, [budget, unitPrice])
  const targetPosts = useMemo(() => requiredViews > 0 && avgViews > 0 ? calcTargetPosts(requiredViews, avgViews) : 0, [requiredViews, avgViews])
  const guaranteedViews = useMemo(() => budget > 0 && unitPrice > 0 ? calcGuaranteedViews(budget, unitPrice) : 0, [budget, unitPrice])

  // 単価のフォーム値（空なら placeholder のデフォルトを使う）
  const reviewUnitPrice = parseFloat(form.review_unit_price) || DEFAULT_REVIEW_UNIT_PRICE
  const userRewardUnitPrice = parseFloat(form.user_reward_unit_price) || DEFAULT_USER_REWARD_UNIT_PRICE

  // 投稿者数（実投稿数）— null/0 なら審査費は null（DB にも書き込まない）
  const postersCount: number | null = form.posters_count
    ? parseInt(form.posters_count) || null
    : null

  const subcontractFee = useMemo(
    () => subs.reduce((sum, s) => sum + (parseFloat(s.delegated_amount) || 0), 0),
    [subs]
  )
  const adDeliveryCost = parseFloat(form.ad_delivery_amount) || 0
  const miscCost = parseFloat(form.misc_amount) || 0
  const manualUserReward = form.user_reward_amount ? parseFloat(form.user_reward_amount) : null

  // 自動計算のユーザー報酬（手動値が無いとき）
  const rewardAutoCalc = useMemo(() => {
    if (manualUserReward != null && manualUserReward > 0) return manualUserReward
    if (requiredViews <= 0) return 0
    return Math.round(requiredViews * userRewardUnitPrice)
  }, [requiredViews, userRewardUnitPrice, manualUserReward])

  // 精緻な粗利サマリー
  const profit = useMemo(() => calcCampaignProfit({
    budget,
    unitPrice,
    avgViews,
    postersCount,
    retailMargin: parseFloat(form.retail_margin) || 0,
    agencyMargin: parseFloat(form.agency_margin) || 0,
    reviewUnitPrice,
    userRewardUnitPrice,
    manualUserReward,
    subcontractFee,
    adDeliveryCost,
    miscCost,
  }), [
    budget, unitPrice, avgViews, postersCount,
    form.retail_margin, form.agency_margin,
    reviewUnitPrice, userRewardUnitPrice,
    manualUserReward, subcontractFee, adDeliveryCost, miscCost,
  ])

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
        // PL（v4: 売上＝予算モデル。billing_amount は budget をそのまま保存）
        billing_amount: budget > 0 ? Math.round(budget) : null,
        retail_margin: form.retail_margin ? parseFloat(form.retail_margin) / 100 : null,
        agency_margin: form.agency_margin ? parseFloat(form.agency_margin) / 100 : null,
        review_unit_price: form.review_unit_price ? parseFloat(form.review_unit_price) : null,
        user_reward_unit_price: form.user_reward_unit_price ? parseFloat(form.user_reward_unit_price) : null,
        user_reward_amount: form.user_reward_amount ? parseFloat(form.user_reward_amount) : null,
        posters_count: postersCount,
        // Subcontracts
        subcontracts: subs.filter(s => s.company_name.trim()).map(s => ({
          sort_order: s.sort_order,
          company_name: s.company_name,
          delegated_amount: parseFloat(s.delegated_amount) || 0,
          delegated_revenue: parseFloat(s.delegated_revenue) || 0,
          notes: s.notes || null,
        })),
      }

      // 派生コスト（misc / ad_delivery / user_reward）の同期 payload
      // ※ §11: 審査費は EG ページから集計するので案件側では DB に書き込まない（二重計上排除）
      // ユーザー報酬は手動値があればそれ、無ければ自動計算（profit.userReward）
      const syncPayload = {
        userReward: profit.userReward > 0 ? profit.userReward : null,
        adDelivery: adDeliveryCost > 0 ? adDeliveryCost : null,
        miscCost: miscCost > 0 ? miscCost : null,
      }

      if (mode === 'create') {
        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(campaignData),
        })
        if (res.ok) {
          const data = await res.json()
          await fetch(`/api/campaigns/${data.id}/sync-campaign-costs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncPayload),
          })
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
          await fetch(`/api/campaigns/${campaign!.id}/sync-campaign-costs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncPayload),
          })
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
                <Label>売上（＝予算）</Label>
                <Input type="text" value={budget > 0 ? formatCurrency(Math.round(budget)) : ''} readOnly className="bg-gray-100" />
                <p className="text-xs text-orange-600">※ PL に反映させるには「再生完了」日の入力が必要です（再生完了月＝請求月として扱われます）</p>
              </div>
              <div className="space-y-2">
                <Label>投稿者一覧（メモ）</Label>
                <Input value={form.influencers} onChange={e => setForm(p => ({ ...p, influencers: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>投稿者数（実投稿数）</Label>
                <NumericInput
                  value={form.posters_count}
                  onChange={v => setForm(p => ({ ...p, posters_count: v }))}
                  integerOnly
                />
                <p className="text-xs text-gray-500">空欄なら審査費は計算されません</p>
              </div>
              <div className="space-y-2">
                <Label>審査単価</Label>
                <NumericInput
                  value={form.review_unit_price}
                  onChange={v => setForm(p => ({ ...p, review_unit_price: v }))}
                  placeholder={`デフォルト: ${DEFAULT_REVIEW_UNIT_PRICE}`}
                />
              </div>
              <div className="space-y-2">
                <Label>ユーザー報酬単価</Label>
                <NumericInput
                  value={form.user_reward_unit_price}
                  onChange={v => setForm(p => ({ ...p, user_reward_unit_price: v }))}
                  placeholder={`デフォルト: ${DEFAULT_USER_REWARD_UNIT_PRICE}`}
                />
              </div>
              <div className="space-y-2">
                <Label>ユーザー報酬額（自動 or 手動）</Label>
                <NumericInput value={form.user_reward_amount} onChange={v => setForm(p => ({ ...p, user_reward_amount: v }))} placeholder={rewardAutoCalc > 0 ? `自動: ${formatCurrency(rewardAutoCalc)}` : ''} />
                <p className="text-xs text-gray-400">
                  空欄 = 必要再生回数({formatNumber(requiredViews)}) × 報酬単価(¥{form.user_reward_unit_price || DEFAULT_USER_REWARD_UNIT_PRICE}) で自動算出
                </p>
              </div>
              <div className="space-y-2">
                <Label>広告配信費</Label>
                <NumericInput value={form.ad_delivery_amount} onChange={v => setForm(p => ({ ...p, ad_delivery_amount: v }))} integerOnly />
                <p className="text-xs text-gray-400">
                  PL の「広告配信費」行に再生完了月で計上されます
                </p>
              </div>
              <div className="space-y-2">
                <Label>その他諸経費</Label>
                <NumericInput value={form.misc_amount} onChange={v => setForm(p => ({ ...p, misc_amount: v }))} integerOnly />
                <p className="text-xs text-gray-400">
                  PL の「その他諸経費」行に再生完了月で計上されます
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
                  <div className="flex justify-between"><span className="text-gray-600">外注代理店フィー合計</span><span className="font-medium">{formatCurrency(subcontractFee || null)}</span></div>
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

        {/* Sidebar: 粗利サマリー（営業利益まで段階損益） */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader><CardTitle className="text-base">粗利サマリー</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>売上</span>
                <span className="tabular-nums">{formatCurrency(budget || null)}</span>
              </div>

              <div className="border-t pt-2 space-y-1">
                <div className="text-xs font-medium text-gray-500">原価</div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  ※ 審査費は案件単位の試算値。実費はEGページで管理
                </p>
                <RowKV label="審査費（試算）" value={profit.reviewCost} />
                <RowKV label="ユーザー報酬" value={profit.userReward} />
                <RowKV label="外注代理店フィー" value={profit.subcontract} />
                <RowKV label="広告配信費" value={profit.adDelivery} />
                <RowKV label="その他諸経費" value={profit.misc} />
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>原価合計</span>
                  <span className="tabular-nums">{formatCurrency(profit.totalCost || null)}</span>
                </div>
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between font-bold">
                  <span>粗利</span>
                  <span className={`tabular-nums ${profit.grossProfit > 0 ? 'text-green-700' : profit.grossProfit < 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(profit.grossProfit || null)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>粗利率</span>
                  <span className="tabular-nums">{budget > 0 ? formatPercent(profit.grossMarginRate) : '—'}</span>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1">
                <div className="text-xs font-medium text-gray-500">販管費（営業代理店フィー）</div>
                <RowKV label={`小売マージン (${form.retail_margin || 0}%)`} value={profit.retailFee} />
                <RowKV label={`代理店マージン (${form.agency_margin || 0}%)`} value={profit.agencyFee} />
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>販管費合計</span>
                  <span className="tabular-nums">{formatCurrency(profit.sgaTotal || null)}</span>
                </div>
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between font-bold">
                  <span>営業利益</span>
                  <span className={`tabular-nums ${profit.operatingProfit > 0 ? 'text-green-700' : profit.operatingProfit < 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(profit.operatingProfit || null)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>営業利益率</span>
                  <span className="tabular-nums">{budget > 0 ? formatPercent(profit.operatingMarginRate) : '—'}</span>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1">
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

function RowKV({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="tabular-nums">{value != null && value > 0 ? formatCurrency(value) : '—'}</span>
    </div>
  )
}
