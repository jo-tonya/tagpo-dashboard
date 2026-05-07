// Tagpo事業管理システム — 計算ロジック（v3 統合版）

// === 進行管理用（tagpo-projectsから移植） ===

/**
 * 必要再生回数 = 予算 ÷ 再生単価（整数）
 */
export function calcRequiredViews(budget: number, unitPrice: number): number {
  if (unitPrice === 0) return 0
  return Math.round(budget / unitPrice)
}

/**
 * 目標投稿数 = 必要再生回数 ÷ 平均再生回数（切り上げ）
 */
export function calcTargetPosts(requiredViews: number, avgViews: number): number {
  if (avgViews === 0) return 0
  return Math.ceil(requiredViews / avgViews)
}

// === PL用（tagpo-systemから移植） ===

/**
 * 保証再生回数 = 予算 ÷ 再生単価（小数）
 */
export function calcGuaranteedViews(budget: number, unitPrice: number): number {
  if (unitPrice === 0) return 0
  return budget / unitPrice
}

/**
 * 売上（請求金額）= 予算 × (1 - 小売M - 代理店M)
 */
export function calcRevenue(budget: number, retailMargin: number, agencyMargin: number): number {
  return budget * (1 - retailMargin - agencyMargin)
}

/**
 * 自社売上 = 売上 - Σ(外注先の委託分売上)
 */
export function calcSelfRevenue(
  totalRevenue: number,
  subcontracts: { delegatedRevenue: number }[]
): number {
  const totalDelegated = subcontracts.reduce((sum, s) => sum + s.delegatedRevenue, 0)
  return totalRevenue - totalDelegated
}

/**
 * 案件コスト合計 = Σ委託金額 + ユーザー支払 + 広告配信費
 */
export function calcProjectTotalCost(
  subcontracts: { delegatedAmount: number }[],
  tonyaUserPayment: number,
  adDeliveryCost: number
): number {
  const subcontractTotal = subcontracts.reduce((sum, s) => sum + s.delegatedAmount, 0)
  return subcontractTotal + tonyaUserPayment + adDeliveryCost
}

/**
 * 実費計算（粗利）
 */
export function calcGrossProfit(params: {
  revenue: number
  ownViewCost: number
  otherSpecialCost: number
  adDeliveryCost: number
  productCost: number
  reviewCost: number
  enidoorPayment: number
  otherAgencyPayment: number
  ymsPayment: number
  budget: number
}): { grossProfit: number; grossProfitRate: number } {
  const totalCost =
    params.ownViewCost +
    params.otherSpecialCost +
    params.adDeliveryCost +
    params.productCost +
    params.reviewCost +
    params.enidoorPayment +
    params.otherAgencyPayment +
    params.ymsPayment
  const grossProfit = params.revenue - totalCost
  const grossProfitRate = params.budget > 0 ? grossProfit / params.budget : 0

  return { grossProfit, grossProfitRate }
}

/**
 * ユーザー報酬額を算出
 * 手動値があればそれを使い、なければ 必要再生回数 × ユーザー報酬単価（デフォルト 0.4）
 */
export function calcUserRewardAmount(
  manualAmount: number | null,
  budget: number | null,
  unitPrice: number | null,
  userRewardUnitPrice: number | null
): number | null {
  if (manualAmount != null && manualAmount > 0) return manualAmount
  if (!budget || !unitPrice) return null
  const rewardRate = userRewardUnitPrice ?? 0.4
  const requiredViews = calcRequiredViews(budget, unitPrice)
  return Math.round(requiredViews * rewardRate)
}

/**
 * 案件粗利サマリーの精緻計算（v4 売上=予算モデル、商品代廃止＋審査費=投稿者数ベース）
 *
 *   売上     = budget
 *   原価     = ① 審査費 + ② ユーザー報酬 + ③ 外注代理店フィー + ④ 広告配信費 + ⑤ その他諸経費
 *   粗利     = 売上 - 原価合計
 *   販管費   = 小売マージン額 + 代理店マージン額（営業代理店フィー）
 *   営業利益 = 粗利 - 販管費
 *
 *   ① 審査費       = postersCount × reviewUnitPrice（デフォ単価 1000）
 *      ※ postersCount が null/0 のときは null（粗利サマリーで「—」表示、DB にも書き込まない）
 *   ② ユーザー報酬 = manualUserReward があればそれ、無ければ requiredViews × userRewardUnitPrice（デフォ 0.4）
 *   ③ 外注代理店フィー = subcontractFee（Σ delegated_amount）
 *   ④ 広告配信費   = adDeliveryCost
 *   ⑤ その他諸経費 = miscCost
 *
 *   targetPosts は粗利サマリー下部の参考表示用（審査費の計算には使わない）。
 */
export function calcCampaignProfit(params: {
  budget: number
  unitPrice: number
  avgViews: number
  postersCount: number | null  // 投稿者数（実投稿数）。null なら審査費は null
  retailMargin: number          // %
  agencyMargin: number          // %
  reviewUnitPrice: number       // デフォルト 1000 を呼び出し側で渡す
  userRewardUnitPrice: number   // デフォルト 0.4 を呼び出し側で渡す
  manualUserReward: number | null
  subcontractFee: number
  adDeliveryCost: number
  miscCost: number
}) {
  const requiredViews = calcRequiredViews(params.budget, params.unitPrice)
  const targetPosts = calcTargetPosts(requiredViews, params.avgViews)

  // 審査費は投稿者数ベース。null/0 なら null（DB にも書かない方針）
  const reviewCost: number | null = params.postersCount != null && params.postersCount > 0
    ? Math.round(params.postersCount * params.reviewUnitPrice)
    : null
  const userReward = params.manualUserReward != null && params.manualUserReward > 0
    ? params.manualUserReward
    : Math.round(requiredViews * params.userRewardUnitPrice)
  const subcontract = params.subcontractFee
  const adDelivery = params.adDeliveryCost
  const misc = params.miscCost
  const totalCost = (reviewCost ?? 0) + userReward + subcontract + adDelivery + misc

  const grossProfit = params.budget - totalCost
  const grossMarginRate = params.budget > 0 ? grossProfit / params.budget : 0

  const retailFee = Math.round(params.budget * (params.retailMargin / 100))
  const agencyFee = Math.round(params.budget * (params.agencyMargin / 100))
  const sgaTotal = retailFee + agencyFee

  const operatingProfit = grossProfit - sgaTotal
  const operatingMarginRate = params.budget > 0 ? operatingProfit / params.budget : 0

  return {
    requiredViews, targetPosts,
    reviewCost, userReward, subcontract, adDelivery, misc, totalCost,
    grossProfit, grossMarginRate,
    retailFee, agencyFee, sgaTotal,
    operatingProfit, operatingMarginRate,
  }
}

// ================================
// フォーマッター
// ================================

/**
 * 金額フォーマット（¥カンマ区切り）
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  if (Number.isInteger(amount)) {
    return `¥${amount.toLocaleString('ja-JP')}`
  }
  return `¥${amount.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/**
 * パーセント表示
 */
export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

/**
 * 月表示（YYYY/MM）
 */
export function formatMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 数値の整形表示（カンマ区切り）
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('ja-JP')
}
