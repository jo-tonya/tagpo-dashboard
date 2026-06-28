import { PLSummaryTable } from '@/components/dashboard/pl-summary-table'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { BudgetActualSection } from '@/components/dashboard/budget-actual-section'
import { KpiSection } from '@/components/dashboard/kpi-section'
import { getMonthlyPL, getRevenueDetails, getCostDetails, getCostStatusDetails } from '@/lib/data/dashboard'
import { getMonthlyBudgets } from '@/lib/data/budgets'
import { getKpiActuals, getKpiManualValues, getKpiActions, getKpiMonths } from '@/lib/data/kpi'

// §20-3: ページ単位で 60 秒キャッシュ。書き込み API 側の
// revalidatePath('/', 'layout') で即時無効化できる。
export const revalidate = 60

export default async function DashboardPage() {
  const [
    monthlyPL,
    revenueDetails,
    costDetails,
    costStatusDetails,
    budgets,
    kpiActuals,
    kpiManualValues,
    kpiActions,
  ] = await Promise.all([
    getMonthlyPL(),
    getRevenueDetails(),
    getCostDetails(),
    getCostStatusDetails(),
    getMonthlyBudgets(),
    getKpiActuals(),
    getKpiManualValues(),
    getKpiActions(),
  ])
  const kpiMonths = getKpiMonths()

  // ダッシュボード並び順 (改修⑲):
  //   1. PLグラフ（事業利益推移）
  //   2. PL表（月次PL、確度マルチセレクト・CSV エクスポート）
  //   3. 予実グラフ（売上 予実）
  //   4. 予実表（予算 vs 売上、月次／四半期タブ）
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-gray-500">目標・KPI / 月次PL</p>
      </div>

      {/* 0. 目標・KPI（最上部） */}
      <KpiSection
        months={kpiMonths}
        actuals={kpiActuals}
        manualValues={kpiManualValues}
        actions={kpiActions}
      />

      {/* 1. PLグラフ */}
      <ProfitChart data={monthlyPL} />

      {/* 2. PL表 */}
      <PLSummaryTable
        data={monthlyPL}
        revenueDetails={revenueDetails}
        costDetails={costDetails}
        costStatusDetails={costStatusDetails}
      />

      {/* 3. 予実グラフ + 4. 予実表（タブ状態を共有） */}
      <BudgetActualSection monthlyPL={monthlyPL} budgets={budgets} />
    </div>
  )
}
