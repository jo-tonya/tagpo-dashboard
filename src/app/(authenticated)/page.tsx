import { PLSummaryTable } from '@/components/dashboard/pl-summary-table'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { BudgetActualSection } from '@/components/dashboard/budget-actual-section'
import { getMonthlyPL, getRevenueDetails, getCostDetails, getCostStatusDetails } from '@/lib/data/dashboard'
import { getMonthlyBudgets } from '@/lib/data/budgets'

export default async function DashboardPage() {
  const [monthlyPL, revenueDetails, costDetails, costStatusDetails, budgets] = await Promise.all([
    getMonthlyPL(),
    getRevenueDetails(),
    getCostDetails(),
    getCostStatusDetails(),
    getMonthlyBudgets(),
  ])

  // ダッシュボード並び順 (改修⑩):
  //   1. 予実グラフ（売上 予実 + 粗利 予実）
  //   2. 予実表（予算 vs 実績、月次／四半期タブ）
  //   3. PLグラフ（事業利益推移）
  //   4. PL表（月次PL、全体／確定のみタブ）
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-gray-500">月次PL</p>
      </div>

      {/* 1. 予実グラフ + 2. 予実表（タブ状態を共有） */}
      <BudgetActualSection monthlyPL={monthlyPL} budgets={budgets} />

      {/* 3. PLグラフ */}
      <ProfitChart data={monthlyPL} />

      {/* 4. PL表 */}
      <PLSummaryTable
        data={monthlyPL}
        revenueDetails={revenueDetails}
        costDetails={costDetails}
        costStatusDetails={costStatusDetails}
      />
    </div>
  )
}
